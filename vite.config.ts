import { defineConfig, type Plugin } from 'vite';
import {
  attachRedshiftWebSocket,
  createRedshiftServerMiddleware,
} from './server/redshiftServer.js';

function redshiftServerPlugin(): Plugin {
  const middleware = createRedshiftServerMiddleware();
  return {
    name: 'redshift-server',
    configureServer(server) {
      server.middlewares.use(middleware);
      if (server.httpServer) {
        attachRedshiftWebSocket(server.httpServer);
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
      if (server.httpServer) {
        attachRedshiftWebSocket(server.httpServer);
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [redshiftServerPlugin()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
});
