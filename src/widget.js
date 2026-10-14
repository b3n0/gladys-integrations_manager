export function buildWidgetContent(integrations, session) {
  let running = 0;
  let stopped = 0;
  let updates = 0;
  let other = 0;
  for (const integration of integrations) {
    if (integration.status === 'RUNNING') {
      running += 1;
    } else if (integration.status === 'STOPPED') {
      stopped += 1;
    } else {
      other += 1;
    }
    if (integration.update_available) {
      updates += 1;
    }
  }
  const live = session && session.mode === 'gladys';
  return {
    ttl_seconds: 60,
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: live
          ? { en: 'Live data from this Gladys instance.', fr: 'Données en direct de cette instance.' }
          : { en: 'Demo data: no Gladys API key yet.', fr: 'Démonstration : pas encore de clé API.' },
      },
      {
        type: 'status',
        items: [
          { label: { en: 'Running', fr: 'En cours' }, value: running, color: 'success' },
          { label: { en: 'Stopped', fr: 'Arrêtées' }, value: stopped, color: 'neutral' },
          {
            label: { en: 'Updates', fr: 'Mises à jour' },
            value: updates,
            color: updates > 0 ? 'warning' : 'success',
          },
          { label: { en: 'Other states', fr: 'Autres états' }, value: other, color: 'info' },
        ],
      },
    ],
  };
}
