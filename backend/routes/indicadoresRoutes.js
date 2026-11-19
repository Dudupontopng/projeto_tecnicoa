const express = require('express');
const controller = require('../controllers/indicadoresController');
const autenticar = require('../middlewares/autenticacaoMiddleware');

const router = express.Router();

// Qualquer usuário logado; o controller devolve só os dados do escopo do perfil.
router.get('/', autenticar, controller.obter);

module.exports = router;
