begin;
select plan(3);
select is((select schedule from cron.job where jobname = 'trial-reminders'), '*/5 * * * *', 'trial reminders every 5 minutes');
select is((select schedule from cron.job where jobname = 'razorpay-sync'), '0 */6 * * *', 'razorpay sync every 6 hours');
select is((select schedule from cron.job where jobname = 'notification-retry'), '*/15 * * * *', 'notification retry every 15 minutes');
select * from finish();
rollback;
