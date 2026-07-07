// index.js

const express = require('express');
const pagosController = require('./controllers/pagosController');
const morgan = require('morgan');
const cors = require('cors'); // 1. Importamos el paquete CORS

const app = express();

// Middlewares
app.use(cors()); // 2. Usamos el middleware para habilitar todas las peticiones CORS
app.use(morgan('dev'));
app.use(express.json());

// Rutas
app.use('/pagos', pagosController);

app.listen(3004,'0.0.0.0', () => {
    console.log('✅ Microservicio de PAGOS escuchando en el puerto 3004');
});
