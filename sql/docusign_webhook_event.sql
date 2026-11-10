-- @motrac/docusign: de idempotente claim voor de DocuSign Connect-webhook.
-- Neem dit op als migratie in de app (met het eigen nummer). Idempotent, en gelijk
-- aan de tabel die mit-contractenbeheer (0020) en mit-rental (0018) al hebben.
--
-- De primary key maakt de claim atomisch: één INSERT … ON CONFLICT DO NOTHING per
-- (envelop, event). Twee gelijktijdige leveringen van hetzelfde event kunnen zo
-- nooit allebei doorgaan. Zie src/idempotentie.js.
CREATE TABLE IF NOT EXISTS docusign_webhook_event (
  envelope_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  verwerkt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (envelope_id, event_id)
);
