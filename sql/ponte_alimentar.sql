-- =====================================================================
-- Ponte Alimentar - Script de INSTALACAO do banco de dados (MySQL 8+)
--
-- Este script e SEGURO: nao apaga nada. Pode ser executado quantas vezes
-- for preciso; so cria o que ainda nao existe e preserva os dados atuais
-- (usuarios, doacoes, reservas e todo o historico).
--
-- Para APAGAR tudo e comecar do zero (somente em desenvolvimento/testes),
-- use o arquivo separado: sql/reset_banco_desenvolvimento.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS ponte_alimentar
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ponte_alimentar;

-- ---------------------------------------------------------------------
-- usuarios: todos os perfis do sistema (admin, doador, instituicao)
-- A senha nunca e guardada em texto puro: apenas o hash (bcrypt).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome        VARCHAR(120) NOT NULL,
  email       VARCHAR(160) NOT NULL,
  senha_hash  VARCHAR(255) NOT NULL,
  nivel       ENUM('admin', 'doador', 'instituicao') NOT NULL DEFAULT 'doador',
  criado_em   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- instituicoes: dados extras dos usuarios com nivel 'instituicao'.
-- Relacao 1:1 com usuarios. Precisa ser aprovada por um admin.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS instituicoes (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id        INT UNSIGNED NOT NULL,
  nome              VARCHAR(150) NOT NULL,
  endereco          VARCHAR(200) NOT NULL,
  cidade            VARCHAR(100) NOT NULL,
  status_aprovacao  ENUM('pendente', 'aprovada', 'recusada') NOT NULL DEFAULT 'pendente',
  criado_em         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_instituicoes_usuario (usuario_id),
  CONSTRAINT fk_instituicoes_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- categorias: tipos de alimento (hortifruti, padaria, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome  VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_nome (nome)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- doacoes: lotes de alimento publicados pelos doadores
-- (entidade principal do CRUD, implementado na Entrega 3)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doacoes (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  doador_id     INT UNSIGNED NOT NULL,
  categoria_id  INT UNSIGNED NOT NULL,
  titulo        VARCHAR(150) NOT NULL,
  descricao     TEXT NULL,
  quantidade    DECIMAL(10,2) NOT NULL,
  unidade       VARCHAR(20) NOT NULL,
  validade      DATE NOT NULL,
  retirada_ate  DATETIME NOT NULL,
  status        ENUM('disponivel', 'reservada', 'retirada', 'cancelada', 'expirada')
                NOT NULL DEFAULT 'disponivel',
  criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_doacoes_status_validade (status, validade),
  CONSTRAINT ck_doacoes_quantidade CHECK (quantidade > 0),
  CONSTRAINT fk_doacoes_doador
    FOREIGN KEY (doador_id) REFERENCES usuarios (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_doacoes_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- reservas: uma instituicao reserva uma doacao.
-- Regra de negocio no proprio banco: so pode existir UMA reserva
-- 'ativa' por doacao (coluna gerada + indice unico; valores NULL
-- nao entram na restricao de unicidade).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  doacao_id       INT UNSIGNED NOT NULL,
  instituicao_id  INT UNSIGNED NOT NULL,
  status          ENUM('ativa', 'cancelada', 'retirada') NOT NULL DEFAULT 'ativa',
  reservada_em    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retirada_em     DATETIME NULL,
  doacao_ativa    INT UNSIGNED GENERATED ALWAYS AS
                  (CASE WHEN status = 'ativa' THEN doacao_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reservas_uma_ativa_por_doacao (doacao_ativa),
  -- ON UPDATE RESTRICT: o MySQL nao permite CASCADE em FK cuja coluna
  -- e usada por uma coluna gerada (doacao_ativa).
  CONSTRAINT fk_reservas_doacao
    FOREIGN KEY (doacao_id) REFERENCES doacoes (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reservas_instituicao
    FOREIGN KEY (instituicao_id) REFERENCES instituicoes (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Dados iniciais (categorias): inseridos somente se a tabela estiver vazia,
-- para nao duplicar nem recriar categorias que o administrador removeu.
-- O usuario administrador e criado por: npm run seed (backend/),
-- pois a senha precisa ser transformada em hash pelo Node.js.
-- ---------------------------------------------------------------------
INSERT INTO categorias (nome)
SELECT nome FROM (
  SELECT 'Hortifruti' AS nome
  UNION ALL SELECT 'Padaria e confeitaria'
  UNION ALL SELECT 'Laticinios e frios'
  UNION ALL SELECT 'Carnes e pescados'
  UNION ALL SELECT 'Graos e cereais'
  UNION ALL SELECT 'Alimentos industrializados'
  UNION ALL SELECT 'Refeicoes prontas'
  UNION ALL SELECT 'Bebidas'
) AS iniciais
WHERE NOT EXISTS (SELECT 1 FROM categorias);
