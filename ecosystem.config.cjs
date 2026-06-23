const path = require('path');

module.exports = {
  apps: [
    {
      name: 'pantrypal-api',
      script: 'index.js',
      cwd: path.resolve(__dirname, 'backend'),
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
      env_file: path.resolve(__dirname, '.env'),
    },
    {
      name: 'pantrypal-front',
      script: 'npx',
      args: 'vite preview --port 3004 --host',
      cwd: path.resolve(__dirname, 'frontend'),
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
