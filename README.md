# EducaGrana independente

Aplicativo estático de finanças pessoais, inspirado nas áreas acessíveis do EducaGrana original. Não depende da Base44, de Node, de bibliotecas externas ou de serviços remotos.

## Abrir

Abra `index.html` em um navegador moderno. Os dados ficam no armazenamento local daquele navegador e dispositivo. Para usar com um domínio, publique os arquivos em um provedor de hospedagem estática com HTTPS.

## Recursos

- Painel com resumo mensal, categorias e evolução dos gastos.
- Cadastro, edição, busca, filtros e exportação CSV de gastos.
- Cadastro e remoção de cartões.
- Receitas com frequência, calendário e ativação/pausa.
- Calculadora de parcelas e juros compostos.
- Tema claro/escuro e cópia/importação JSON dos dados locais.

## Limites

A cópia começa vazia e não inclui dados pessoais da conta usada para consultar o original. Não possui login, sincronização entre dispositivos, Google Auth, IA ou backend; nenhuma credencial é solicitada ou transmitida. O site original exige autenticação, portanto funções internas que não foram observadas não estão incluídas.

`localStorage` não substitui um banco de dados seguro e pode ser apagado pelo navegador. Faça cópias JSON antes de trocar de dispositivo ou limpar os dados do navegador.

## Domínio próprio

É necessário registrar ou controlar um domínio completo e configurar o DNS no provedor de hospedagem. A hospedagem precisa fornecer HTTPS. Este projeto não registra domínio nem altera DNS automaticamente. Nenhum domínio foi informado nesta etapa.
