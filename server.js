const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Configuration CORS
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
app.use(express.json());

// --- NOUVELLE ROUTE DE TEST (Indispensable pour le bouton vert sur mobile) ---
app.get('/', (req, res) => {
    res.json({ 
        status: "success", 
        message: "Bienvenue sur l'API Tantsaha ! Le serveur est opérationnel.",
        mode: process.env.MYSQLHOST ? 'Production (Railway)' : 'Local'
    });
});

// Dossier uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- CONNEXION MYSQL ADAPTÉE ---
const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'agrivoice_db',
    port: process.env.MYSQLPORT || 3306,
    connectTimeout: 10000
});

db.connect(err => {
    if (err) {
        console.error('❌ Erreur MySQL:', err.message);
    } else {
        console.log('✅ Base de données connectée');
    }
});

// Configuration Multer pour les fichiers audio
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- ROUTES AUTHENTIFICATION ---
app.post('/api/inscription', (req, res) => {
    const { nom, telephone, password, region } = req.body;
    const query = "INSERT INTO users (nom, telephone, pin, region) VALUES (?, ?, ?, ?)";
    db.query(query, [nom, telephone, password, region], (err) => {
        if (err) return res.status(500).json({ error: "Efa misy mampiasa io laharana io" });
        res.json({ message: "Tafiditra soa aman-tsara ny kaontinao!" });
    });
});

app.post('/api/login', (req, res) => {
    const { telephone, password } = req.body;
    const query = "SELECT * FROM users WHERE telephone = ? AND pin = ?";
    db.query(query, [telephone, password], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "Diso ny laharana na ny teny miafina" });
        res.json({ message: "Tafiditra ianao!", user: results[0] });
    });
});

// --- ROUTE HISTORIQUE ---
app.get('/api/historique', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: "ID manquant" });

    const query = "SELECT * FROM consultations WHERE user_id = ? ORDER BY date_demande DESC";
    db.query(query, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- ROUTE MÉTÉO ET CALENDRIER ---
app.get('/api/alerte-meteo', async (req, res) => {
    try {
        const { region, culture } = req.query;
        const API_KEY = '7c5f4bea27b729b2a7e0acc443b24a58';
        let city = region || 'Antananarivo';
        
        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=fr`;
        const response = await axios.get(url);
        
        const moisActuel = new Date().getMonth() + 1;
        const query = "SELECT * FROM calendrier_cultural WHERE nom_culture = ? AND mois_debut <= ? AND mois_fin >= ?";
        
        db.query(query, [culture, moisActuel, moisActuel], (err, results) => {
            const conseil = (results && results.length > 0) ? results[0] : { conseil_meteo_pluie: "Tandremo ny voly." };
            res.json({
                previsions: response.data.list.slice(0, 3),
                message: conseil.conseil_meteo_pluie, 
                niveau: response.data.list[0].weather[0].main === 'Rain' ? 'danger' : 'success'
            });
        });
    } catch (e) { 
        res.json({ message: "Meteo tsy azo", previsions: [], niveau: 'success' }); 
    }
});

// --- ENVOI AUDIO (UPLOAD) ---
app.post('/api/upload-audio', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).send("Fichier manquant");
    const audioPath = `/uploads/${req.file.filename}`;
    const userId = req.body.user_id;

    const sql = "INSERT INTO consultations (user_id, audio_question_url, status) VALUES (?, ?, 'en_attente')";
    db.query(sql, [userId, audioPath], (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ message: "Voaray ny feonao!" });
    });
});

// --- DÉMARRAGE DU SERVEUR ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur le port ${PORT}`);
});
