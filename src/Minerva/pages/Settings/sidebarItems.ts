/**
 * Sidebar item catalogue — pure data, deliberately dependency-free.
 *
 * This lives in its own leaf module because <Sidebar> needs
 * DEFAULT_SIDEBAR_SHORTCUTS, and Sidebar is in the EAGER entry bundle. Importing
 * it from pages/Settings dragged the whole Settings page — and through it
 * framer-motion, DraggableList and @hello-pangea/dnd — into the entry chunk,
 * silently defeating the lazyRetry split that gives Settings its own chunk.
 *
 * Keep this file free of React and of any component import.
 */
export interface SidebarItem { key: string; label: string; }

export const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
    { key: 'dashboard',       label: 'DASHBOARD'    },
    { key: 'events',          label: 'EVENTS'       },
    { key: 'callbacks',       label: 'CALLBACKS'    },
    { key: 'console',         label: 'CONSOLE'      },
    { key: 'task',            label: 'TASKS'        },
    { key: 'payloads',        label: 'PAYLOADS'     },
    { key: 'credentials',     label: 'CREDENTIALS'  },
    { key: 'files',           label: 'FILES'        },
    { key: 'c2-profiles',     label: 'C2 PROFILES'  },
    { key: 'tunnels',         label: 'TUNNELS'      },
    { key: 'quickhacks',      label: 'QUICKHACK'    },
    { key: 'users',           label: 'USERS'        },
    { key: 'search',          label: 'SEARCH'       },
    { key: 'topology',        label: '3D TOPOLOGY'  },
    { key: 'metasploit',      label: 'METASPLOIT'   },
    { key: 'settings',        label: 'SETTINGS'     },
    { key: 'opsec',           label: 'OPSEC'        },
    { key: 'operations',      label: 'OPERATIONS'   },
    { key: 'artifacts',       label: 'ARTIFACTS'    },
    { key: 'mitre',           label: 'MITRE'        },
    { key: 'reporting',       label: 'REPORTING'    },
    { key: 'tags',            label: 'TAGS'         },
    { key: 'browser-scripts', label: 'SCRIPTS'      },
    { key: 'eventing',        label: 'EVENTING'     },
    { key: 'payload-types',   label: 'PKG TYPES'    },
    { key: 'jupyter',         label: 'JUPYTER'      },
    { key: 'graphql',         label: 'GRAPHQL'      },
];

export const DEFAULT_SIDEBAR_SHORTCUTS: string[] = ALL_SIDEBAR_ITEMS.map(i => i.key);
