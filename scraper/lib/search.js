'use strict';
// Search term for each restaurant slug in column A (used to find its store on
// each platform and to match saved menus to it).

// Search terms for the internal restaurant slugs in column A.
const SEARCH_TERMS = {
  '7 cortes_milsabores': '7 cortes', 'Carls_Jr_CL': "carl's jr", 'China Wok_Grupo Degasa': 'china wok',
  'Club del Poke - La Florida III': 'club del poke', 'Doggis_Grupo G&N': 'doggis', 'DunkinDonuts_MS_CL': 'dunkin',
  'Fork_CL': 'fork', 'Grido Mall Alto Pe�alolen': 'grido', 'Grido_RM': 'grido',
  'Juan Maestro Centro Comercial Maipu': 'juan maestro', 'Juan Maestro Líder Vicuña Mackenna': 'juan maestro',
  'Juan Maestro_Grupo G&N': 'juan maestro', 'LittleCaesarsCL': 'little caesars', 'Momofuku (Ultimate Parent)': 'momofuku',
  'momofuku (ultimate parent)': 'momofuku', 'Más Que Empanada (Viña del Mar)': 'mas que empanada',
  'Streat Burger_DD_CL': 'streat burger', 'SushiBlues_Grupo Food Hall': 'sushi blues', 'Tarragona': 'tarragona',
  'alsea_pfchangs': "p.f. chang's", 'atomic_clubdelgohan': 'club del gohan', 'atomic_clubdelpoke': 'club del poke',
  'atomic_itacate': 'itacate', 'atomic_mrtaste': 'mr taste', 'atomic_poked': 'poked', 'atomic_vittore': 'vittore',
  'atomic_wingit': 'wing it', 'barriochicken_cl': 'barrio chicken', 'buffalo_waffles': 'buffalo waffles',
  'buffetexpress_cl': 'buffet express', 'chicken_factory': 'chicken factory', 'chilis_alsea': "chili's",
  'doggis_heladeria_g&n': 'doggis heladeria', 'domino_cl': "domino's pizza", 'elcaferosa': 'el cafe rosa',
  'elementalcl': 'elemental', 'fuente_chilena': 'fuente chilena', 'idilico_cl': 'idilico', 'jimmyjohns_cl': "jimmy john's",
  'johnnyrocketschile': 'johnny rockets', 'just_burger_cl': 'just burger', 'kairos': 'kairos', 'la ermita': 'la ermita',
  'lovdo_g&n_cl': 'lovdo', 'mamut_chile': 'mamut', 'mariberico': 'mariberico', 'melt_pizzas': 'melt pizzas',
  'mesondelmarinero_milsabores': 'meson del marinero', 'milas_cl': 'milas', 'milsabores_barrachalaca': 'barra chalaca',
  'milsabores_bodegondelima': 'el bodegon', 'milsabores_dulceluna': 'dulce luna', 'milsabores_ekeko': 'ekeko',
  'milsabores_eljapones': 'el japones', 'milsabores_enriquetomas': 'enrique tomas', 'milsabores_fuente': 'fuente mardoqueo',
  'milsabores_havanna': 'havanna', 'milsabores_jalisco': 'jalisco', 'milsabores_la_argentina': 'la argentina',
  'milsabores_lady': 'lady focaccia', 'milsabores_lapiazza': 'la piazza', 'milsabores_lasanguchera': 'la sanguchera',
  'milsabores_mammamia': 'mamma mia', 'milsabores_mila': 'mila', 'milsabores_muusteak': 'muu steak',
  'milsabores_takeawok': 'take a wok', 'milsabores_tanta': 'tanta', 'noahs_ cl': "noah's", 'papajohns_ch': "papa john's",
  'pizzapizza_cl': 'pizza pizza', 'pollostop_ch': 'pollo stop', 'roof_burger_cl': 'roof burger', 'sbarro_pronto': 'sbarro',
  'sin_miedo_burgers': 'sin miedo', 'streat_icecream': 'streat', 'tommy beans_chile': 'tommy beans', 'udon_parent_tbd': 'udon',
  'underpizza_cl': 'under pizza', 'wendyscl': "wendy's", 'wevo_burger': 'wevo',
};

function defaultSearch(name) {
  if (SEARCH_TERMS[name]) return SEARCH_TERMS[name];
  return name.replace(/\(.*?\)/g, ' ').replace(/^(milsabores|atomic|alsea)_/i, '').replace(/_(cl|ch|chile|rm|g&n|grupo.*)$/i, '')
    .replace(/[_-]+/g, ' ').trim().toLowerCase();
}

module.exports = { SEARCH_TERMS, defaultSearch };
