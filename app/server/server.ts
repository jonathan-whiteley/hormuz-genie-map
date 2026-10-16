import { createApp, analytics, genie, server } from '@databricks/appkit';
import { genieSpaceIdFrom } from './genieConfig';

// The Genie space id comes from DATABRICKS_GENIE_SPACE_ID (the bundle's genie_space_id at deploy time,
// .env locally); it is never written into tracked files. Until a real id is set, the genie plugin is not
// registered at all: AppKit's genie manifest marks the space as required, so registering it without an
// id would stop the whole server at startup. Genie calls run on behalf of the viewer.
const genieSpaceId = genieSpaceIdFrom(process.env);
if (!genieSpaceId) console.log('Genie is not configured (DATABRICKS_GENIE_SPACE_ID unset or placeholder); the Genie panel is off.');

createApp({
  plugins: [analytics(), ...(genieSpaceId ? [genie({ spaces: { default: genieSpaceId } })] : []), server()],
  onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      app.get('/api/app-config', (_req, res) => {
        res.json({
          catalog: process.env.HORMUZ_CATALOG ?? 'jdub_demo',
          schema: process.env.HORMUZ_SCHEMA ?? 'hormuz',
          genieSpaceTitle: process.env.GENIE_SPACE_TITLE ?? 'Hormuz Chokepoint Monitor',
          genieEnabled: genieSpaceId !== null,
        });
      });
    });
  },
}).catch(console.error);
