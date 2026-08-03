import { createEditionAdapter } from '../../../../packages/game-core/src/index.js';
import editionContent from '../../../../content/company-v1/edition.json' with { type: 'json' };
import organization from '../../../../content/company-v1/organization.json' with { type: 'json' };
import map from '../../../../content/company-v1/map.json' with { type: 'json' };
import characters from '../../../../content/company-v1/characters.json' with { type: 'json' };
import generalNpcs from '../../../../content/company-v1/general_npcs.json' with { type: 'json' };
import csaPresets from '../../../../content/company-v1/csa_presets.json' with { type: 'json' };

const edition = createEditionAdapter({
  editionId: editionContent.edition_id,
  contentVersion: editionContent.content_version,
  organization,
  map,
  characters,
  generalNpcs,
  csaPresets
});

export default edition;
