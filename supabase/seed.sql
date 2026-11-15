-- Platform defaults (local + CI). Staging/production set these via the admin panel.
insert into public.platform_settings (key, value) values
  ('commission_rate', '{"bps": 2000}'),
  ('legal_versions', '{"terms": "draft-1", "privacy": "draft-1", "practitioner_agreement": "draft-1"}')
on conflict (key) do nothing;

-- Categories: Healer / Astrologer / Psychic and their subcategories.
insert into public.categories (name, slug, sort_order) values
  ('Healer', 'healer', 1), ('Astrologer', 'astrologer', 2), ('Psychic', 'psychic', 3)
on conflict (slug) do nothing;

insert into public.categories (parent_id, name, slug, sort_order)
select p.id, c.name, c.slug, c.sort_order
from (values
  ('healer', 'Reiki', 'reiki', 1), ('healer', 'Pranic Healing', 'pranic-healing', 2),
  ('healer', 'Sound Healing', 'sound-healing', 3), ('healer', 'Crystal Healing', 'crystal-healing', 4),
  ('healer', 'Energy Healing', 'energy-healing', 5),
  ('astrologer', 'Vedic Astrology', 'vedic-astrology', 1), ('astrologer', 'Western Astrology', 'western-astrology', 2),
  ('astrologer', 'Numerology', 'numerology', 3), ('astrologer', 'Vastu', 'vastu', 4),
  ('astrologer', 'Palmistry', 'palmistry', 5),
  ('psychic', 'Tarot Reading', 'tarot-reading', 1), ('psychic', 'Intuitive Reading', 'intuitive-reading', 2),
  ('psychic', 'Mediumship', 'mediumship', 3), ('psychic', 'Angel Card Reading', 'angel-card-reading', 4)
) as c(parent_slug, name, slug, sort_order)
join public.categories p on p.slug = c.parent_slug
on conflict (slug) do nothing;
