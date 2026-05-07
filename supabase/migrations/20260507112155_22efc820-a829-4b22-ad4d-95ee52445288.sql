DELETE FROM public.email_send_log WHERE template_name='manual-test' AND recipient_email='strijbosmh@gmail.com';
SELECT pgmq.purge_queue('transactional_emails_dlq');