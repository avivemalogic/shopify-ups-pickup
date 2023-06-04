const fs = require('fs');
const CronJob = require('cron').CronJob;

const folderPath = '/var/www/shopify/public/ups-labels/';

const deleteOldFiles = () => {
    try {
        fs.readdirSync(folderPath).forEach(file => {
            const filePath = `${folderPath}${file}`;
            const fileStat = fs.statSync(filePath);
            const fileAge = Date.now() - fileStat.mtime.getTime();

            if (fileAge > 86400000) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${filePath}`);
            }
        });
    } catch (err) {
        console.error('Error deleting files:', err);
    }
};

module.exports = () => {
    if (!CronJob.running) {
        const job = new CronJob('0 0 * * *', deleteOldFiles);
        job.start();
        console.log('Cron job started.');
    } else {
        console.log('Cron job is already running.');
    }
};