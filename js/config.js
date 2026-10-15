/*
 * Configuração da loja — edite aqui os dados de contato e do catálogo.
 *
 * Os mesmos telefones e endereço também aparecem escritos no HTML (para o
 * Google e para quem navega sem JavaScript). Ao mudar um contato, procure
 * pelo número antigo nos arquivos .html e troque lá também.
 */
window.LIGUE_CONFIG = {
  loja: {
    nome: 'Ligue Fraldas Geriátricas',
    razaoSocial: 'Comércio Varejista de Produtos de Higiene Pessoal LTDA - ME',
    cnpj: '10.601.507/0001-54'
  },

  whatsapp: {
    // Somente dígitos: 55 (Brasil) + DDD + número
    numero: '5521998928742',
    exibicao: '(21) 99892-8742',
    mensagemPadrao: 'Olá! Vim pelo site da Ligue Fraldas Geriátricas e gostaria de mais informações.'
  },

  telefones: [
    { numero: '+552122588588', exibicao: '(21) 2258-8588' },
    { numero: '+552125761617', exibicao: '(21) 2576-1617' }
  ],

  // Perfil oficial da loja.
  instagram: {
    url: 'https://www.instagram.com/liguefraldas/',
    usuario: '@liguefraldas'
  },

  catalogo: {
    loja: 'data/loja.json',       // catálogo administrado pelo painel (só existe na hospedagem)
    produtos: 'data/produtos.json', // catálogo inicial, versionado no Git
    categorias: 'data/categorias.json',
    ajustes: 'data/ajustes.json', // criado pelo painel na hospedagem; pode não existir
    porPagina: 24         // produtos por "página" no catálogo (botão "Carregar mais")
  }
};
