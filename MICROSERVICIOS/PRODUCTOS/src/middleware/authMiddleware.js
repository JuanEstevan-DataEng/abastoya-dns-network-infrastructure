// src/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const JWT_SECRET = 'tu_secreto_super_secreto_para_jwt_12345'; // El mismo secreto que en el controlador

function authMiddleware(req, res, next) {
    // 1. Buscamos el token en la cabecera 'Authorization'
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Acceso denegado. No se proporcionó un token.' });
    }

    // 2. Extraemos el token (quitamos "Bearer ")
    const token = authHeader.split(' ')[1];

    try {
        // 3. Verificamos el token con nuestro secreto
        const payloadDecodificado = jwt.verify(token, JWT_SECRET);

        // 4. Si es válido, añadimos el payload (info del usuario) al objeto 'req'
        // para que las siguientes funciones (los controladores) puedan usarlo.
        req.usuario = payloadDecodificado;
        req.token = token; // <- AÑADIDO: Adjuntamos el token para forwarding

        // 5. Continuamos con la siguiente función en la cadena (el controlador)
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token inválido o expirado.' });
    }
}

module.exports = authMiddleware;