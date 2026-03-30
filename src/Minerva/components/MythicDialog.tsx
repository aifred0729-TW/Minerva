/**
 * Legacy shim – re-exports MythicDialog family from old MythicComponents.
 * Minerva code should import from here instead of reaching into ../../components/.
 * When we port these to Minerva-native, replace the re-export with the new impl.
 */
export {
  MythicDialog,
  MythicModifyStringDialog,
  MythicViewJSONAsTableDialog,
  MythicViewObjectPropertiesAsTableDialog,
  TableRowDateCell,
  TableRowSizeCell,
} from '../../components/MythicComponents/MythicDialog';
