

DROP DATABASE IF EXISTS ponte_alimentar;
CREATE DATABASE ponte_alimentar
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ponte_alimentar;

CREATE TABLE usuarios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome        VARCHAR(120) NOT NULL,
  email       VARCHAR(160) NOT NULL,
  senha_hash  VARCHAR(255) NOT NULL,
  nivel       ENUM('admin', 'doador', 'instituicao') NOT NULL DEFAULT 'doador',
  criado_em   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;


CREATE TABLE instituicoes (
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

CREATE TABLE categorias (
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome  VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_nome (nome)
) ENGINE=InnoDB;

CREATE TABLE doacoes (
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


CREATE TABLE reservas (
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

  CONSTRAINT fk_reservas_doacao
    FOREIGN KEY (doacao_id) REFERENCES doacoes (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reservas_instituicao
    FOREIGN KEY (instituicao_id) REFERENCES instituicoes (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;


INSERT INTO categorias (nome) VALUES
  ('Hortifruti'),
  ('Padaria e confeitaria'),
  ('Laticinios e frios'),
  ('Carnes e pescados'),
  ('Graos e cereais'),
  ('Alimentos industrializados'),
  ('Refeicoes prontas'),
  ('Bebidas');
