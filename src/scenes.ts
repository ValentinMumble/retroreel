import type {SceneKey} from './types';

export const SCENES: Record<SceneKey, {label: string; color: string}> = {
  silent: {label: 'Silent era', color: '#b39570'},
  classic: {label: 'Classic Hollywood', color: '#f2c14e'},
  romance: {label: 'Romance & melodrama', color: '#ff7eb6'},
  crime: {label: 'Noir, crime & thrillers', color: '#8aa4c8'},
  western: {label: 'Westerns', color: '#cf8a4b'},
  epic: {label: 'War & epics', color: '#b8b46a'},
  realism: {label: 'Realism & social drama', color: '#a8d05a'},
  arthouse: {label: 'New waves & art house', color: '#8f7dff'},
  newhollywood: {label: 'New Hollywood', color: '#ff6a3d'},
  horror: {label: 'Horror', color: '#ff3b3b'},
  scifi: {label: 'Sci-fi & fantasy', color: '#2ee6c5'},
  action: {label: 'Action & adventure', color: '#ff9a2e'},
  comedy: {label: 'Comedy', color: '#f7e85b'},
  musical: {label: 'Musicals & music', color: '#d65cff'},
  animation: {label: 'Animation', color: '#5fd68a'},
  indie: {label: 'Indie & modern drama', color: '#4fc3f7'},
  doc: {label: 'Documentary', color: '#efe3cc'},
};

export const SCENE_ORDER = Object.keys(SCENES) as SceneKey[];
