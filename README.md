
# 💻 ViaPro ERP - Web App (Front-end)

> Interface administrativa elegante e reativa para Gestão de Estoque, Compras e Inteligência Financeira.

Este repositório contém a aplicação Front-end Web do sistema ViaPro. Projetado com foco total na experiência do usuário (UX), oferece relatórios dinâmicos, controle de inventário preciso e exportações nativas com apenas um clique.

## 🚀 Tecnologias Utilizadas

* **React:** Construção da interface em SPA (Single Page Application).
* **TypeScript:** Código robusto, tipado e auto-documentado.
* **Axios:** Cliente HTTP para comunicação assíncrona com a API.
* **XLSX & jsPDF + AutoTable:** Motores de exportação para geração instantânea de relatórios gerenciais complexos.
* **React Toastify:** Sistema de feedbacks visuais não intrusivos.

## 🔑 Principais Funcionalidades

1. **Dashboard Financeiro (Pacote Ouro):** Inteligência de dados com cálculo em tempo real de Lucro Projetado, Caixa Comprometido, Prejuízo Mensal (Rupturas) e filtros dinâmicos de Categoria e Busca.
2. **Armazém & Gestão de SKUs:** Controle completo do catálogo, com endereçamento físico (módulos/prateleiras) e alertas automáticos de estoque crítico.
3. **Módulo de Compras (Supply Chain):** Emissão de pedidos diretamente para fornecedores com status de recebimento.
4. **Relatórios Nativos:** Geração de planilhas Excel e arquivos PDF de alta qualidade que respeitam os filtros aplicados na tela.

---

## 🛠️ Guia de Instalação e Execução

### 1. Clonar o Repositório
```bash
git clone [https://github.com/rodrigoarcanjo23/controle-estoque-web.git](https://github.com/rodrigoarcanjo23/controle-estoque-web.git)
cd controle-estoque-web
2. Instalar as Dependências
Bash
npm install
3. Configurar a Conexão com a API
Verifique se existe um arquivo .env na raiz do projeto para apontar para a sua API local ou em produção.

Snippet de código
# Exemplo usando Vite:
VITE_API_URL=http://localhost:3333

# Exemplo usando Create React App:
REACT_APP_API_URL=http://localhost:3333
Alternativamente, você pode verificar o arquivo src/api.ts para garantir que a baseURL do Axios está apontando para o endereço correto da API.

4. Iniciar o Servidor de Desenvolvimento
Rode o comando abaixo para iniciar a aplicação no seu navegador:

Bash
npm run dev
# ou 'npm start' se estiver usando o Create React App clássico
📐 Estrutura de Estilos (Design System)
A aplicação utiliza uma arquitetura visual centralizada (DRY). A grande maioria dos estilos de botões, modais, tabelas e tipografia está consolidada no arquivo src/styles/globalStyles.ts. Isso facilita a manutenção e garante uma identidade visual coesa em toda a plataforma.

Desenvolvido com ☕ e código limpo por Bonfirecode.


---

Esses arquivos cobrem todos os detalhes técnicos cruciais para rodar o projeto do zero
