# EducaGrana independente

Aplicativo estático de finanças pessoais, sem dependência da Base44 e sem etapa de build. Sem Supabase configurado, os registros ficam apenas no navegador. Com Supabase configurado, contas de e-mail podem sincronizar o progresso entre dispositivos.

## Abrir

Abra `index.html` em um navegador moderno ou acesse o deploy do Cloudflare Pages. Para usar contas, configure o Supabase conforme abaixo e publique os arquivos em hospedagem estática com HTTPS.

## Recursos

- Painel com resumo mensal, categorias e evolução dos gastos.
- Cadastro, edição, busca, filtros e exportação CSV de gastos.
- Cadastro e remoção de cartões.
- Receitas com frequência, calendário e ativação/pausa.
- Calculadora de parcelas e juros compostos.
- Tema claro/escuro, cópia/importação JSON e login por e-mail.
- Sincronização de progresso autenticada pelo Supabase, quando configurada.

## Ativar contas e sincronização

1. Crie um projeto Supabase e habilite autenticação por e-mail.
2. No SQL Editor do projeto, execute [`supabase/schema.sql`](supabase/schema.sql). A tabela usa RLS e só permite que cada usuário leia e altere a própria linha.
3. Em `supabase-config.js`, preencha `url` com o Project URL e `anonKey` com a chave pública `anon`/`publishable` do projeto.
4. Configure a URL do site e os redirects de confirmação de e-mail e recuperação de senha para o endereço do Cloudflare Pages, por exemplo `https://educafinancias.pages.dev`.
5. Publique as alterações. O Cloudflare Pages fará deploy após o commit.

Use somente a chave pública `anon`/`publishable` no navegador. Nunca coloque a chave `service_role`, senha do banco ou tokens privados em `supabase-config.js` ou no GitHub.

## Privacidade e limites

A cópia começa vazia e não inclui dados pessoais da conta usada para consultar o original. As credenciais de login são processadas pelo Supabase Auth. O cliente envia progresso somente após autenticação; a política RLS em `supabase/schema.sql` isola os dados por `auth.uid()`.

O navegador mantém um cache local para funcionamento e recuperação. `localStorage` não substitui um banco de dados seguro; faça cópias JSON importantes e não use a versão sem Supabase como backup entre dispositivos. IA e compartilhamento de contas não estão incluídos.

## Domínio próprio

O app pode ser acessado pelo subdomínio gratuito do Cloudflare Pages. Um domínio próprio exige registro e configuração DNS; este projeto não altera DNS automaticamente.
