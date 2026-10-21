import type {SceneKey} from './types';

export interface Era {
  label: string;
  start: number;
  end: number;
  lane: 0 | 1;
  scene: SceneKey;
  blurb: string;
}

/** Lane 0 is the main story, lane 1 the side currents that overlap it. Eras in one lane never overlap. */
export const ERAS: Era[] = [
  {
    label: 'Early cinema',
    start: 1895,
    end: 1914,
    lane: 0,
    scene: 'silent',
    blurb: 'Fairground shows, magic tricks and the first stories told on film.',
  },
  {
    label: 'Silent features',
    start: 1915,
    end: 1927,
    lane: 0,
    scene: 'silent',
    blurb: 'Films grow to feature length, and Chaplin and Keaton become world stars.',
  },
  {
    label: 'Golden age',
    start: 1928,
    end: 1945,
    lane: 0,
    scene: 'classic',
    blurb: 'Sound arrives and the Hollywood studios rule the world.',
  },
  {
    label: 'Post-war',
    start: 1946,
    end: 1958,
    lane: 0,
    scene: 'realism',
    blurb: 'Neorealism in Rome, noir in Los Angeles, the great masters in Tokyo.',
  },
  {
    label: 'New waves',
    start: 1959,
    end: 1966,
    lane: 0,
    scene: 'arthouse',
    blurb: 'Young critics pick up cameras in Paris, Prague and Tokyo.',
  },
  {
    label: 'New Hollywood',
    start: 1967,
    end: 1980,
    lane: 0,
    scene: 'newhollywood',
    blurb: 'Film school directors take over the studios.',
  },
  {
    label: 'Blockbuster era',
    start: 1981,
    end: 1989,
    lane: 0,
    scene: 'action',
    blurb: 'High concepts, sequels and the VHS boom.',
  },
  {
    label: 'Indie boom',
    start: 1990,
    end: 1999,
    lane: 0,
    scene: 'indie',
    blurb: 'Sundance, Miramax and Tarantino.',
  },
  {
    label: 'Digital turn',
    start: 2000,
    end: 2009,
    lane: 0,
    scene: 'scifi',
    blurb: 'Digital cameras, computer effects and DVD extras.',
  },
  {
    label: 'Franchise era',
    start: 2010,
    end: 2019,
    lane: 0,
    scene: 'action',
    blurb: 'Superhero universes fill the multiplex, auteurs head for festivals.',
  },
  {
    label: 'Streaming era',
    start: 2020,
    end: 2026,
    lane: 0,
    scene: 'indie',
    blurb: 'Lockdowns, streaming platforms and Barbenheimer.',
  },
  {
    label: 'German Expressionism',
    start: 1919,
    end: 1927,
    lane: 1,
    scene: 'arthouse',
    blurb: 'Painted shadows and crooked sets in Weimar Berlin.',
  },
  {
    label: 'Pre-Code',
    start: 1930,
    end: 1934,
    lane: 1,
    scene: 'classic',
    blurb: 'Sex, gangsters and wisecracks before Hollywood enforced its censorship code.',
  },
  {
    label: 'Film noir',
    start: 1941,
    end: 1958,
    lane: 1,
    scene: 'crime',
    blurb: 'Shadows, femmes fatales and hard-boiled voice-overs.',
  },
  {
    label: 'Spaghetti westerns',
    start: 1964,
    end: 1973,
    lane: 1,
    scene: 'western',
    blurb: 'Leone, Morricone and Spain standing in for the Wild West.',
  },
  {
    label: 'Slasher boom',
    start: 1978,
    end: 1984,
    lane: 1,
    scene: 'horror',
    blurb: 'Halloween starts a wave of masked killers.',
  },
  {
    label: 'Hong Kong action',
    start: 1986,
    end: 1997,
    lane: 1,
    scene: 'action',
    blurb: 'John Woo, Jackie Chan and gunfights in slow motion.',
  },
  {
    label: 'Korean new wave',
    start: 2000,
    end: 2008,
    lane: 1,
    scene: 'crime',
    blurb: 'Park Chan-wook and Bong Joon-ho put Seoul on the film map.',
  },
  {
    label: 'Elevated horror',
    start: 2014,
    end: 2023,
    lane: 1,
    scene: 'horror',
    blurb: 'The Babadook, Get Out and Hereditary take horror to the festivals.',
  },
];
