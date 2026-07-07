// index.js

const express = require('express');
const entregasController = require('./controllers/entregasController');
const morgan = require('morgan');
const cors = require('cors'); // 1. Importamos el paquete CORS

const app = express();

// Middlewares
app.use(cors()); // 2. Usamos el middleware para habilitar todas las peticiones CORS
app.use(morgan('dev'));
app.use(express.json());

// Rutas
app.use('/entregas', entregasController);

app.listen(3005, () => {
    console.log('✅ Microservicio de ENTREGAS escuchando en el puerto 3005');
});