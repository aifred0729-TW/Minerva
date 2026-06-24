import { gql } from '@apollo/client';

export const SUB_PAYLOAD_TYPES = gql`
  subscription SubPayloadTypes {
    payloadtype(order_by: {name: asc}) {
      id
      name
      agent_type
      author
      note
      container_running
      supported_os
      supports_dynamic_loading
      deleted
      semver
      wrapper
      translation_container { id name container_running }
      wrap_these_payload_types {
        id
        wrapped { id name }
      }
      commands(order_by: {cmd: asc}) {
        id
        cmd
        description
        needs_admin
        supported_ui_features
        version
        deleted
      }
    }
  }
`;

export const SUB_CONSUMING_CONTAINERS = gql`
  subscription SubConsumingContainers {
    consuming_container(order_by: {name: asc}) {
      id
      name
      container_running
      subscriptions
      description
      type
      deleted
      semver
    }
  }
`;

export const SUB_TRANSLATION_CONTAINERS = gql`
  subscription SubTranslationContainers {
    translationcontainer(order_by: {name: asc}) {
      id
      name
      container_running
      deleted
      description
      author
      semver
      payloadtypes(order_by: {name: asc}) {
        name
        deleted
        id
      }
    }
  }
`;

export const SUB_CUSTOM_BROWSERS = gql`
  subscription SubCustomBrowsers {
    custombrowser(order_by: {name: asc}) {
      id
      name
      description
      type
      container_running
      deleted
      author
      semver
      columns
      export_function
      row_actions
      extra_table_inputs
    }
  }
`;

export const TOGGLE_CONSUMING_DELETE = gql`
  mutation ToggleConsumingDelete($id: Int!, $deleted: Boolean!) {
    update_consuming_container_by_pk(pk_columns: {id: $id}, _set: {deleted: $deleted}) { id deleted }
  }
`;

export const TOGGLE_PAYLOADTYPE_DELETE = gql`
  mutation TogglePayloadTypeDelete($payloadtype_id: Int!, $deleted: Boolean!) {
    update_payloadtype_by_pk(pk_columns: {id: $payloadtype_id}, _set: {deleted: $deleted}) { id deleted }
  }
`;

export const TOGGLE_TRANSLATION_DELETE = gql`
  mutation ToggleTranslationDelete($translationcontainer_id: Int!, $deleted: Boolean!) {
    update_translationcontainer_by_pk(pk_columns: {id: $translationcontainer_id}, _set: {deleted: $deleted}) { id deleted }
  }
`;

export const TOGGLE_BROWSER_DELETE = gql`
  mutation ToggleCustomBrowserDelete($custombrowser_id: Int!, $deleted: Boolean!) {
    update_custombrowser_by_pk(pk_columns: {id: $custombrowser_id}, _set: {deleted: $deleted}) { id deleted }
  }
`;

export const TEST_WEBHOOK = gql`
  mutation TestWebhook($service_type: String!) {
    consumingServicesTestWebhook(service_type: $service_type) { status error }
  }
`;

export const TEST_LOG = gql`
  mutation TestLog($service_type: String!) {
    consumingServicesTestLog(service_type: $service_type) { status error }
  }
`;

export const GET_PAYLOAD_BUILD_PARAMS = gql`
  query GetPayloadBuildParams($payload_name: String!) {
    payloadtype(where: {name: {_eq: $payload_name}}) {
      id
      buildparameters(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
        id
        name
        description
        default_value
        parameter_type
        required
        verifier_regex
        choices
        crypto_type
        randomize
        format_string
      }
    }
  }
`;

export const GET_PAYLOAD_COMMANDS = gql`
  query GetPayloadCommands($payload_name: String!) {
    command(where: {payloadtype: {name: {_eq: $payload_name}}}, order_by: {cmd: asc}) {
      id
      cmd
      description
      version
      needs_admin
      deleted
    }
  }
`;

export const GET_COMMAND_PARAMETERS = gql`
  query GetCommandParameters($command_id: Int!) {
    commandparameters(where: {command_id: {_eq: $command_id}}, order_by: {ui_position: asc}) {
      id
      cli_name
      name
      display_name
      description
      type
      default_value
      required
      choices
      choices_are_all_commands
      choices_are_loaded_commands
      choice_filter_by_command_attributes
      dynamic_query_function
      limit_credentials_by_type
      parameter_group_name
      supported_agent_build_parameters
      supported_agents
      ui_position
      verifier_regex
    }
  }
`;

export const LIST_CONTAINER_FILES = gql`
  query ListContainerFiles($container_name: String!) {
    containerListFiles(container_name: $container_name) {
      status
      error
      files
    }
  }
`;

export const REMOVE_CONTAINER_FILE = gql`
  mutation RemoveContainerFile($container_name: String!, $filename: String!) {
    containerRemoveFile(container_name: $container_name, filename: $filename) {
      status
      error
    }
  }
`;

export const DOWNLOAD_CONTAINER_FILE = gql`
  query DownloadContainerFile($container_name: String!, $filename: String!) {
    containerDownloadFile(container_name: $container_name, filename: $filename) {
      status
      error
      filename
      data
    }
  }
`;

export const WRITE_CONTAINER_FILE = gql`
  mutation WriteContainerFile($container_name: String!, $file_path: String!, $data: String!) {
    containerWriteFile(container_name: $container_name, file_path: $file_path, data: $data) {
      status
      error
      filename
    }
  }
`;
