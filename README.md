# Ponte Alimentar

Sistema web que conecta estabelecimentos com alimentos excedentes (mercados, padarias, restaurantes) a instituições que atendem pessoas em situação de vulnerabilidade (ONGs, abrigos, cozinhas comunitárias).

> **Status:** Entrega 1 — Problema, proposta e estrutura inicial.

---

## 1. Problema identificado

### Contexto
Diariamente, estabelecimentos descartam alimentos ainda próprios para consumo: produtos perto da validade, sobras de produção, itens com embalagem danificada ou excesso de estoque. Ao mesmo tempo, instituições sociais precisam de alimentos para atender famílias em situação de insegurança alimentar.

O problema não é apenas a falta de alimento, mas a **falta de comunicação organizada** entre quem tem excedente e quem precisa dele. Hoje essa conexão acontece por contatos informais (ligações, grupos de mensagens, conhecidos), o que gera:

- doações que não acontecem porque o alimento vence antes de alguém saber que ele existe;
- doadores sem canal simples para oferecer o excedente;
- instituições que não sabem o que está disponível nem quando retirar;
- falta de registro e acompanhamento do que foi doado e retirado.

> **Dado de apoio (preencher antes de entregar):** inserir aqui 1 ou 2 dados oficiais sobre desperdício de alimentos e insegurança alimentar no Brasil, com a fonte citada (ex.: FAO, IBGE, Rede PENSSAN).

### Público afetado
- **Estabelecimentos doadores:** perdem alimento e não têm canal simples para doar.
- **Instituições sociais:** têm dificuldade de acessar alimentos e de planejar a retirada.
- **Famílias atendidas pelas instituições:** são o público final, afetado pela falta de alimento.
- **Comunidade em geral:** sofre os impactos sociais e ambientais do desperdício.

### Justificativa
Uma plataforma centralizada reduz o tempo entre o surgimento do excedente e a retirada, organiza as doações com prazo e status e deixa um histórico verificável. A solução é viável com tecnologias web simples e pode ser adotada por pequenos estabelecimentos.

---

## 2. Proposta de solução

A **Ponte Alimentar** é uma aplicação web em que:

1. um **doador** publica um lote de alimento com quantidade, validade e prazo de retirada;
2. uma **instituição aprovada** vê as doações disponíveis e reserva as que consegue retirar;
3. o doador **confirma a retirada**, e o sistema registra o histórico;
4. um **administrador** valida as instituições e acompanha o funcionamento geral.

### Objetivos
- **Geral:** reduzir o desperdício de alimentos aproximando doadores e instituições.
- **Específicos:**
  - permitir a publicação e o gerenciamento de doações com validade e prazo;
  - evitar que um mesmo lote seja reservado por mais de uma instituição;
  - garantir que só instituições verificadas recebam doações;
  - manter histórico de doações, reservas e retiradas;
  - proteger os dados com autenticação JWT e controle de acesso por perfil.

### Tecnologias
HTML5, CSS3, JavaScript (DOM + Fetch), Node.js, Express, MySQL, `mysql2`, `jsonwebtoken`, `bcryptjs`, `dotenv`, `cors`.

---

## 3. Funcionalidades previstas

**Gerais**
- Cadastro e login com senha protegida (hash) e autenticação por JWT.
- Redirecionamento e acesso conforme o perfil do usuário.

**Doações (CRUD principal)**
- Publicar, listar, consultar, editar e excluir doações.
- Filtrar doações por categoria, status e validade.

**Reservas**
- Reservar uma doação disponível.
- Cancelar uma reserva (a doação volta a ficar disponível).
- Confirmar a retirada.

**Administração**
- Aprovar ou recusar o cadastro de instituições.
- Listar e gerenciar usuários.
- Gerenciar categorias de alimentos.
- Visualizar o histórico geral e indicadores simples (total de doações, retiradas, quantidade doada).

**Regras de negócio**
- Não é possível publicar doação com validade já vencida.
- Apenas instituições **aprovadas** podem reservar.
- Um lote só pode ter **uma reserva ativa** por vez.
- O doador só edita ou exclui as **próprias** doações, e somente enquanto estiverem *disponíveis*.
- Doações vencidas passam automaticamente para o status *expirada*.
- Uma doação *retirada* não pode mais ser alterada ou excluída (preserva o histórico).

---

## 4. Tipos de usuário e permissões

| Perfil | Quem é | Ações permitidas |
|---|---|---|
| **Doador** | Estabelecimento com excedente | Cadastrar-se; criar, editar e excluir **suas** doações; ver reservas de suas doações; confirmar retirada |
| **Instituição** | ONG, abrigo, cozinha comunitária | Cadastrar-se (aguarda aprovação); ver doações disponíveis; reservar e cancelar **suas** reservas; ver seu histórico |
| **Administrador** | Responsável pela plataforma | Aprovar/recusar instituições; gerenciar usuários e categorias; ver e moderar todas as doações; ver indicadores |

> As permissões serão validadas **na API** (middleware de autorização + conferência de dono do recurso no controller), e não apenas escondendo botões ou páginas no front-end.

---

## 5. Fluxo básico de funcionamento

```text
Cadastro → Login (JWT) → Redirecionamento conforme o perfil

DOADOR                      INSTITUIÇÃO                 ADMINISTRADOR
  │                              │                            │
  │                              │  cadastro ──────────────►  │ aprova / recusa
  │                              │ ◄────────── aprovada ────  │
  │ publica doação               │                            │
  │ (status: disponível) ───────►│ lista doações disponíveis  │
  │                              │ reserva (status: reservada)│
  │ ◄──── vê a reserva ──────────│                            │
  │ confirma retirada            │                            │
  │ (status: retirada)           │ histórico atualizado       │ acompanha indicadores
```

Fluxos alternativos:
- A instituição cancela a reserva e a doação volta para *disponível*.
- A validade passa e a doação é marcada como *expirada*.
- O doador cancela a doação antes de qualquer reserva.

---

## 6. Banco de dados (planejamento)

Tabelas previstas, todas com chaves primárias e estrangeiras (script em `sql/ponte_alimentar.sql`, a ser criado na Entrega 2):

- `usuarios` (id, nome, email, senha_hash, nivel: `admin` | `doador` | `instituicao`, criado_em)
- `instituicoes` (id, usuario_id → usuarios, nome, endereco, cidade, status_aprovacao)
- `categorias` (id, nome)
- `doacoes` (id, doador_id → usuarios, categoria_id → categorias, titulo, descricao, quantidade, unidade, validade, retirada_ate, status)
- `reservas` (id, doacao_id → doacoes, instituicao_id → instituicoes, status, reservada_em, retirada_em)

Relacionamentos: um usuário doador possui várias doações; uma categoria agrupa várias doações; uma doação possui no máximo uma reserva ativa; uma instituição possui várias reservas.

---

## 7. Arquitetura do back-end (planejada)

Padrão: **routes → middlewares → controllers → database**, com `server.js` apenas configurando a aplicação.

```text
Front-end (HTML/CSS/JS) ──Fetch + JSON──► API Express
   └► Middlewares (CORS, autenticação, autorização)
        └► Routes ► Controllers ► SQL parametrizado ► MySQL
```

### Estrutura de pastas

```text
ponte-alimentar/
├── backend/
│   ├── routes/          (rotas: método + URL → controller)
│   ├── controllers/     (validações, regras de negócio e SQL)
│   ├── middlewares/     (autenticação JWT, autorização, CORS)
│   ├── database/        (conexão com o MySQL e seed)
│   └── .env.example
├── frontend/
│   ├── css/
│   └── js/
├── sql/                 (scripts do banco de dados)
├── .gitignore
└── README.md
```

Arquivos previstos nas próximas entregas:

```text
backend/server.js
backend/routes/          authRoutes.js, usuariosRoutes.js, instituicoesRoutes.js,
                         categoriasRoutes.js, doacoesRoutes.js, reservasRoutes.js
backend/controllers/     authController.js, usuariosController.js, instituicoesController.js,
                         categoriasController.js, doacoesController.js, reservasController.js
backend/middlewares/     autenticacaoMiddleware.js, autorizacaoMiddleware.js, corsMiddleware.js
backend/database/        conexao.js, seed.js
frontend/                login.html, cadastro.html, doador.html, instituicao.html, admin.html
sql/                     ponte_alimentar.sql
```

### Responsabilidades
- **routes:** associam método HTTP + URL ao controller e aplicam os middlewares.
- **controllers:** validam os dados, aplicam as regras de negócio e executam o SQL.
- **middlewares:** `autenticacaoMiddleware` valida o JWT; `autorizacaoMiddleware(...niveis)` restringe por perfil; `corsMiddleware` libera a origem do front-end.
- **database:** `conexao.js` cria o pool MySQL com variáveis do `.env`; `seed.js` popula dados iniciais.

### Rotas planejadas

| Método | Rota | Acesso |
|---|---|---|
| POST | `/auth/cadastro` | Público |
| POST | `/auth/login` | Público |
| GET | `/doacoes` | Autenticado |
| GET | `/doacoes/:id` | Autenticado |
| POST | `/doacoes` | Doador, Admin |
| PUT | `/doacoes/:id` | Doador (dono), Admin |
| DELETE | `/doacoes/:id` | Doador (dono), Admin |
| POST | `/reservas` | Instituição aprovada |
| PUT | `/reservas/:id/cancelar` | Instituição (dona) |
| PUT | `/reservas/:id/retirada` | Doador (dono da doação) |
| GET | `/instituicoes` | Admin |
| PUT | `/instituicoes/:id/aprovacao` | Admin |
| GET/POST/PUT/DELETE | `/categorias` | Leitura: autenticado; escrita: Admin |
| GET/PUT/DELETE | `/usuarios` | Admin |

### Segurança
- Senhas com `bcryptjs`; JWT com segredo no `.env`.
- SQL sempre parametrizado.
- `.env`, `node_modules` e credenciais **não** são enviados ao GitHub (veja `.gitignore`).

---

## 8. Como executar

Instruções de instalação, configuração do `.env`, criação do banco e testes serão adicionadas nas próximas entregas, conforme o projeto evoluir.

## 9. Cronograma das entregas

| Entrega | Foco | Situação |
|---|---|---|
| 1 | Problema, proposta e estrutura inicial | Em entrega |
| 2 | Banco de dados, autenticação e JWT | Pendente |
| 3 | CRUD, integração e permissões | Pendente |
| 4 | Projeto completo, documentação e apresentação | Pendente |
