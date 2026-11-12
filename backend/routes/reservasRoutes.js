const express = require('express');
const controller = require('../controllers/reservasController');
const autenticar = require('../middlewares/autenticacaoMiddleware');
const permitir = require('../middlewares/autorizacaoMiddleware');

const router = express.Router();

router.use(autenticar);

router.get('/', controller.listar);
router.post('/', permitir('instituicao'), controller.criar);
router.put('/:id/cancelar', permitir('instituicao', 'admin'), controller.cancelar);
router.put('/:id/retirada', permitir('doador', 'admin'), controller.confirmarRetirada);

module.exports = router;
