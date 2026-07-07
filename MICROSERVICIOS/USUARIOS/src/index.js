// src/index.js

const express = require('express');
const cors = require('cors');
const morgan = require('morgan'); // 1. Importa morgan
const usuariosController = require('./controllers/usuariosController');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // 2. Úsalo como middleware

app.use('/usuarios', usuariosController);

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Microservicio de USUARIOS escuchando en el puerto ${PORT}`);
});
