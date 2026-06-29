module.exports = {
  apps: [
    {
      name: 'catalog-weekly-sync',
      script: 'scripts/weeklySync.js',
      cwd: '/home/sketchy/projects/pantrypal/backend',
      cron_restart: '0 3 * * 0',
      autorestart: false,
      watch: false,
    },
  ],
};
