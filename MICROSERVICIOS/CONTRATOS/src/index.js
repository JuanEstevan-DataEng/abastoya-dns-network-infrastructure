// index.js

const express = require('express');
const contratosController = require('./controllers/contratosController');
const morgan = require('morgan');
const cors = require('cors'); // 1. Importamos el paquete CORS

const app = express();

// Middlewares
app.use(cors()); // 2. Usamos el middleware para habilitar todas las peticiones CORS
app.use(morgan('dev'));
app.use(express.json());

// Rutas
app.use('/contratos', contratosController);

app.listen(3003, '0.0.0.0', () => {
    console.log('✅ Microservicio de CONTRATOS escuchando en el puerto 3003');
});
