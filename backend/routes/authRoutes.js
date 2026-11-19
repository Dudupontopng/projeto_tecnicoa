const express = require('express');
const controller = require('../controllers/authController');
const autenticar = require('../middlewares/autenticacaoMiddleware');
const limitarLogin = require('../middlewares/limiteLoginMiddleware');

const router = express.Router();

router.post('/cadastro', controller.cadastrar); // publica
router.post('/login', limitarLogin, controller.login); // publica (com limite de tentativas)
router.get('/me', autenticar, controller.perfil); // qualquer usuario autenticado

module.exports = router;
