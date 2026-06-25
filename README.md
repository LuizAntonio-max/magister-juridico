# Magister AI — Gestão Jurídica

App completo de gestão jurídica com pesquisa de processos por IA.

## Como publicar na Vercel (gratuito, 5 minutos)

### Passo 1 — Criar conta no GitHub
1. Acesse **github.com** e crie uma conta gratuita
2. Clique em **New repository** (botão verde)
3. Nome: `magister-juridico` → clique **Create repository**

### Passo 2 — Fazer upload dos arquivos
1. Na página do repositório, clique **uploading an existing file**
2. Arraste TODOS os arquivos desta pasta (index.html, vercel.json, package.json, pasta api/)
3. Clique **Commit changes**

### Passo 3 — Publicar na Vercel
1. Acesse **vercel.com** e clique **Sign up with GitHub**
2. Clique **New Project** → selecione o repositório `magister-juridico`
3. Clique **Deploy** (sem mudar nada)

### Passo 4 — Configurar a API Key (IMPORTANTE)
1. No painel da Vercel, vá em **Settings → Environment Variables**
2. Adicione:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** sua chave `sk-ant-...` (obtenha em console.anthropic.com)
3. Clique **Save** e depois **Redeploy**

### Pronto!
Seu app estará disponível em `https://magister-juridico-XXXXX.vercel.app`
Você pode configurar um domínio próprio gratuitamente na Vercel.

## Funcionalidades
- Cadastro completo de clientes (PF e PJ) com 5 etapas
- Gestão de processos judiciais
- Pesquisa por OAB, advogado, número CNJ ou nome da parte
- Honorários contratuais e sucumbenciais com parcelamento
- Contabilidade: contas a pagar, a receber e extrato
- Publicações monitoradas por cliente (TJSP, TRT2, DOU etc.)
- Cadastro de advogados
- Responsivo: funciona no celular e no desktop
