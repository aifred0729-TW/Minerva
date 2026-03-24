import React, { createContext } from 'react';
import MinervaApp from '../Minerva/App';

export const MeContext = createContext({});

export function App(props) {
    return <MinervaApp />;
}
