# EducaGrana

App web responsivo de controle financeiro. Gastos, receitas, cartões e preferências ficam salvos no navegador. Ao entrar em uma conta, os dados também são sincronizados com o Supabase e ficam separados por usuário.

## Ativar contas, Google e sincronização

1. Crie um projeto no [Supabase](https://supabase.com/) e abra o **SQL Editor**.
2. Execute o SQL de `supabase-schema.sql`. Ele cria a tabela de dados e políticas RLS que limitam cada conta às próprias informações.
3. Em **Project Settings → API**, copie a **Project URL** e a chave pública **anon/publishable**. Coloque esses valores em `supabase-config.js`, nos campos `url` e `anonKey`. A chave `service_role` é secreta e não deve ser usada no site.
4. Em **Authentication → Providers**, habilite Google e informe as credenciais OAuth do Google. No Google Cloud, configure o callback URL mostrado nas configurações do provedor Google do Supabase.
5. Em **Authentication → URL Configuration**, configure `https://educafinancias.pages.dev` como **Site URL** e adicione `https://educafinancias.pages.dev/**` à lista de endereços de redirecionamento permitidos.
6. No cliente OAuth do Google, o **URI de redirecionamento autorizado** deve ser o callback mostrado em **Supabase → Authentication → Providers → Google** (normalmente `https://<project-ref>.supabase.co/auth/v1/callback`). O callback não é o domínio do Cloudflare Pages. Se a configuração do cliente pedir origens JavaScript autorizadas, adicione `https://educafinancias.pages.dev`.
7. Publique esta pasta no projeto do Cloudflare Pages que atende `educafinancias.pages.dev`, substituindo os arquivos da versão antiga. O endereço público e compartilhável será `https://educafinancias.pages.dev/`. Depois de publicar, confira a página inicial, o login e o botão **Compartilhar**; se o navegador continuar exibindo a versão antiga, feche e reabra o app para atualizar o cache.

O app oferece criação de conta por e-mail e senha, login por Google e sincronização dos dados financeiros por conta. Dependendo das opções de confirmação do Supabase, o usuário pode precisar confirmar o endereço de e-mail antes de entrar.

O domínio `educafinancias.pages.dev` já está servindo uma versão anterior do EducaGrana. É necessário publicar os arquivos desta pasta nele para que a nova versão passe a aparecer nesse endereço. A publicação no Cloudflare Pages e a configuração das credenciais externas precisam ser feitas nas respectivas contas; não são realizadas automaticamente pelo código local.

## Baixar e compartilhar

A página pública para instalar o app será `https://educafinancias.pages.dev/baixar.html`. Publique `baixar.html`, `download.css` e `download.js` junto com os outros arquivos do app. A página orienta a instalação como PWA em Android, iPhone/iPad e computador; ela não é um arquivo APK nem uma publicação em loja de aplicativos. Em navegadores compatíveis, o botão de instalação abre a confirmação nativa. No iPhone/iPad, a instalação é feita pelo menu Compartilhar do Safari.

O botão **Compartilhar** usa o menu de compartilhamento do dispositivo ou copia o endereço público do app. Ele só gera um link acessível depois que o site estiver publicado; caminhos locais do computador não são links compartilháveis.

## Privacidade

O app usa somente a chave pública do Supabase no navegador. A tabela deve permanecer protegida pelas políticas de Row Level Security (RLS) criadas no SQL. Nunca publique a chave `service_role` nem desative RLS.
