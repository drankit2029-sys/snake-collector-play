import BasePortal from './BasePortal.js';
import CrazyGamesPortal from './CrazyGamesPortal.js';
import PokiPortal from './PokiPortal.js';
import { PORTAL_IDS } from './constants.js';

const config = (typeof window !== 'undefined' && window.PORTAL_CONFIG) || {
  id: PORTAL_IDS.GENERIC,
};

let portal;
if (config.id === PORTAL_IDS.POKI) {
  portal = new PokiPortal(config);
} else if (config.id === PORTAL_IDS.CRAZYGAMES) {
  portal = new CrazyGamesPortal(config);
} else {
  portal = new BasePortal(config);
}

if (typeof window !== 'undefined') {
  window.portal = portal;
}

export default portal;
