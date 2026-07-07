// /productos-service/src/index.js

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const productosController = require('./controllers/productosController');

// 1. Inicialización de Express
const app = express();

// 2. Middlewares esenciales
// CORS para permitir peticiones de otros orígenes (como tu frontend)
app.use(cors());
// Morgan para registrar las peticiones HTTP en la consola (muy útil para depurar)
app.use(morgan('dev'));
// Middleware para que Express pueda entender y procesar JSON en el cuerpo de las peticiones
app.use(express.json());

// 3. Rutas principales
// Todas las rutas definidas en productosController estarán bajo el prefijo "/productos"
// Ejemplo: una ruta "/mis-productos" en el controller será accesible en "http://localhost:3002/productos/mis-productos"
app.use('/productos', productosController);

// 4. Puerto y arranque del servidor
// Asignamos un puerto único para este microservicio, diferente al de Usuarios y Contratos
const PORT = 3002;
app.listen(PORT,'0.0.0.0', () => {
    console.log(`✅ Microservicio de PRODUCTOS escuchando en el puerto ${PORT}`);
});

