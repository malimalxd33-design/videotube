const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const dbPath = path.join(__dirname, 'videolar.json');

let db = { videolar: [], sesler: [], aboneler: {}, kullanicilar: {} };
if (fs.existsSync(dbPath)) {
    try {
        const fileData = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(fileData);
        if (Array.isArray(parsed)) {
            db.videolar = parsed;
        } else {
            db = parsed;
            if (!db.sesler) db.sesler = [];
            if (!db.aboneler) db.aboneler = {};
            if (!db.kullanicilar) db.kullanicilar = {};
        }
    } catch (err) {
        db = { videolar: [], sesler: [], aboneler: {}, kullanicilar: {} };
    }
}

function verileriKaydet() {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use('/uploads', express.static(uploadDir));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/veriler', (req, res) => {
    res.json(db);
});

// Kayıt Ol API
app.post('/api/kayit', (req, res) => {
    const { kullanici, sifre } = req.body;
    if (!kullanici || !sifre) {
        return res.json({ basari: false, mesaj: "Kullanıcı adı ve şifre boş olamaz!" });
    }
    if (db.kullanicilar[kullanici]) {
        return res.json({ basari: false, mesaj: "Bu kullanıcı adı zaten alınmış!" });
    }
    db.kullanicilar[kullanici] = sifre;
    verileriKaydet();
    res.json({ basari: true, mesaj: "Kayıt başarılı!" });
});

// Giriş Yap API
app.post('/api/giris', (req, res) => {
    const { kullanici, sifre } = req.body;
    if (!db.kullanicilar[kullanici] || db.kullanicilar[kullanici] !== sifre) {
        return res.json({ basari: false, mesaj: "Hatalı kullanıcı adı veya şifre!" });
    }
    res.json({ basari: true, kullanici });
});

// Video Yükleme
app.post('/api/video-yukle', upload.single('videoDosya'), (req, res) => {
    const { baslik, turu, yukleyen } = req.body;
    if (!req.file) {
        return res.status(400).json({ basari: false, mesaj: "Video dosyası seçilmedi!" });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const yeniVideo = {
        id: Date.now(),
        baslik: baslik || "İsimsiz Video",
        turu: turu || "normal",
        yukleyen: yukleyen || "Misafir",
        url: `/uploads/${req.file.filename}`,
        izlenme: 0,
        begenenler: [],
        begenmeyenler: [],
        yorumlar: []
    };

    db.videolar.unshift(yeniVideo);
    verileriKaydet();
    res.json({ basari: true, video: yeniVideo });
});

// MP3 / Ses Yükleme API
app.post('/api/ses-yukle', upload.single('sesDosya'), (req, res) => {
    const { baslik, yukleyen } = req.body;
    if (!req.file) {
        return res.status(400).json({ basari: false, mesaj: "Ses dosyası seçilmedi!" });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const yeniSes = {
        id: Date.now(),
        baslik: baslik || "İsimsiz Ses",
        yukleyen: yukleyen || "Misafir",
        url: `${baseUrl}/uploads/${req.file.filename}`,
        dinlenme: 0
    };

    if (!db.sesler) db.sesler = [];
    db.sesler.unshift(yeniSes);
    verileriKaydet();
    res.json({ basari: true, ses: yeniSes });
});

// Beğen (Like)
app.post('/api/video/:id/begen', (req, res) => {
    const id = Number(req.params.id);
    const { kullanici } = req.body;
    if (!kullanici) return res.status(400).json({ basari: false, mesaj: "Giriş yapmalısın!" });

    const video = db.videolar.find(v => v.id === id);
    if (!video) return res.status(404).json({ basari: false });

    if (!video.begenenler) video.begenenler = [];
    if (!video.begenmeyenler) video.begenmeyenler = [];

    const dislikeIdx = video.begenmeyenler.indexOf(kullanici);
    if (dislikeIdx > -1) video.begenmeyenler.splice(dislikeIdx, 1);

    const likeIdx = video.begenenler.indexOf(kullanici);
    if (likeIdx > -1) {
        video.begenenler.splice(likeIdx, 1);
    } else {
        video.begenenler.push(kullanici);
    }

    verileriKaydet();
    res.json({ 
        basari: true, 
        begeniler: video.begenenler.length, 
        begenmeyenler: video.begenmeyenler.length,
        begenenler: video.begenenler,
        begenmeyenler: video.begenmeyenler
    });
});

// Beğenmeme (Dislike)
app.post('/api/video/:id/begenme', (req, res) => {
    const id = Number(req.params.id);
    const { kullanici } = req.body;
    if (!kullanici) return res.status(400).json({ basari: false, mesaj: "Giriş yapmalısın!" });

    const video = db.videolar.find(v => v.id === id);
    if (!video) return res.status(404).json({ basari: false });

    if (!video.begenenler) video.begenenler = [];
    if (!video.begenmeyenler) video.begenmeyenler = [];

    const likeIdx = video.begenenler.indexOf(kullanici);
    if (likeIdx > -1) video.begenenler.splice(likeIdx, 1);

    const dislikeIdx = video.begenmeyenler.indexOf(kullanici);
    if (dislikeIdx > -1) {
        video.begenmeyenler.splice(dislikeIdx, 1);
    } else {
        video.begenmeyenler.push(kullanici);
    }

    verileriKaydet();
    res.json({ 
        basari: true, 
        begeniler: video.begenenler.length, 
        begenmeyenler: video.begenmeyenler.length,
        begenenler: video.begenenler,
        begenmeyenler: video.begenmeyenler
    });
});

// Yorum Ekle
app.post('/api/video/:id/yorum', (req, res) => {
    const id = Number(req.params.id);
    const { yazar, metin } = req.body;
    const video = db.videolar.find(v => v.id === id);
    if (!video) return res.status(404).json({ basari: false });
    
    if (!video.yorumlar) video.yorumlar = [];
    
    const yeniYorum = {
        id: Date.now(),
        yazar: yazar || "Misafir",
        metin: metin || "",
        tarih: new Date().toLocaleDateString('tr-TR')
    };

    video.yorumlar.unshift(yeniYorum);
    verileriKaydet();
    res.json({ basari: true, yorumlar: video.yorumlar });
});

// Abone Ol / Abonelikten Çık
app.post('/api/kanal/abone', (req, res) => {
    const { kanalAdi, kullanici } = req.body;
    if (!kanalAdi || !kullanici) return res.status(400).json({ basari: false });

    if (!db.aboneler[kanalAdi]) {
        db.aboneler[kanalAdi] = [];
    }

    const index = db.aboneler[kanalAdi].indexOf(kullanici);
    let aboneMi = false;

    if (index > -1) {
        db.aboneler[kanalAdi].splice(index, 1);
        aboneMi = false;
    } else {
        db.aboneler[kanalAdi].push(kullanici);
        aboneMi = true;
    }

    verileriKaydet();
    res.json({ 
        basari: true, 
        aboneMi, 
        aboneSayisi: db.aboneler[kanalAdi].length,
        aboniler: db.aboneler[kanalAdi]
    });
});

// Video Sil
app.delete('/api/video/:id', (req, res) => {
    const id = Number(req.params.id);
    db.videolar = db.videolar.filter(v => v.id !== id);
    verileriKaydet();
    res.json({ basari: true });
});

// Ses / MP3 Sil
app.delete('/api/ses/:id', (req, res) => {
    const id = Number(req.params.id);
    if (db.sesler) {
        db.sesler = db.sesler.filter(s => s.id !== id);
        verileriKaydet();
    }
    res.json({ basari: true });
});

app.listen(PORT, () => {
    console.log(`Yerel sunucu çalışıyor, abim! Adres: http://localhost:${PORT}`);
});