-- =====================================================================
-- !!! ATENCAO: ARQUIVO DESTRUTIVO - USAR SOMENTE EM DESENVOLVIMENTO !!!
--
-- Apaga o banco "ponte_alimentar" INTEIRO, com todos os usuarios,
-- doacoes, reservas e historico. Nao use em um ambiente com dados reais.
--
-- Para recriar o banco do zero depois do reset, execute nesta ordem:
--   1) sql/reset_banco_desenvolvimento.sql   (este arquivo)
--   2) sql/ponte_alimentar.sql               (instalacao)
--   3) npm run seed                          (administrador inicial)
-- =====================================================================

DROP DATABASE IF EXISTS ponte_alimentar;
