// ═══════════════════════════════════════════════════════════════════
//  MythicSavedUserSetting — operator preference hooks & helpers
//  (Minerva-native – replaces old MythicComponents/MythicSavedUserSetting)
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import { gql } from "@apollo/client";
import { useReactiveVar, useMutation } from "@apollo/client/react";
import { mePreferences, operatorSettingDefaults } from '../lib/state';
import { snackActions } from '../lib/snackbar';

const updatePreferences = gql`
    mutation updatePreferences($preferences: jsonb!) {
        updateOperatorPreferences(preferences: $preferences) {
            status
            error
        }
    }
`;

/**
 * Get the computed font size of the root element in pixels.
 */
export const GetComputedFontSize = (): number => {
  const element = document.getElementById('root');
  if (!element) return 16;
  const fontSizeString = window.getComputedStyle(element).fontSize;
  return parseFloat(fontSizeString);
};

/**
 * React hook that returns a reactive user setting value.
 * Re-renders automatically when the setting changes via mePreferences().
 *
 * Common setting_name options:
 *   hideUsernames, showIP, showHostname, showCallbackGroups, showMedia,
 *   interactType, callbacks_table_columns, callbacks_table_filters
 */
export function useGetMythicSetting({ setting_name, default_value }: {
  setting_name: string;
  default_value: any;
}): any {
  const preferences = useReactiveVar(mePreferences);
  const initialValue = GetMythicSetting({ setting_name, default_value });
  const [setting, setSetting] = React.useState(initialValue);

  React.useEffect(() => {
    const newSetting = GetMythicSetting({ setting_name, default_value });
    setSetting(newSetting);
  }, [preferences?.[setting_name]]);

  return setting;
}

/**
 * Non-reactive getter for a single operator setting value.
 */
export function GetMythicSetting({ setting_name, default_value }: {
  setting_name: string;
  default_value: any;
}): any {
  const preferences = mePreferences();
  return preferences?.[setting_name] === undefined ? default_value : preferences?.[setting_name];
}

/**
 * Hook that returns a tuple of setter functions for operator preferences:
 *   [0] setSingle({ setting_name, value }) — set one preference
 *   [1] setBulk({ settings })              — merge multiple preferences
 *   [2] resetAll()                          — reset all to defaults
 */
export function useSetMythicSetting(): [
  (args: { setting_name: string; value: any }) => void,
  (args: { settings: Record<string, any> }) => void,
  () => void,
] {
  const [updateSetting] = useMutation<any>(updatePreferences, {
    onError: (error) => {
      snackActions.error('failed to save user setting: ' + error.message);
      console.error(error);
    },
  });

  const setSingle = ({ setting_name, value }: { setting_name: string; value: any }) => {
    if (mePreferences()?.[setting_name] !== value) {
      const updatedPreferences = {
        ...mePreferences(),
        [setting_name]: value,
      };
      mePreferences(updatedPreferences);
      updateSetting({ variables: { preferences: updatedPreferences } });
    }
  };

  const setBulk = ({ settings }: { settings: Record<string, any> }) => {
    const updatedPreferences = {
      ...mePreferences(),
      ...settings,
    };
    mePreferences(updatedPreferences);
    updateSetting({ variables: { preferences: updatedPreferences } });
  };

  const resetAll = () => {
    mePreferences(operatorSettingDefaults);
    updateSetting({ variables: { preferences: operatorSettingDefaults } });
  };

  return [setSingle, setBulk, resetAll];
}
