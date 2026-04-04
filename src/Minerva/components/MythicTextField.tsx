// ═══════════════════════════════════════════════════════════════════
//  MythicTextField — styled text input with validation & debounce
//  (Minerva-native)
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import { styled } from '@mui/material/styles';
import { TextField } from '@mui/material';
import { useDebounce } from '../hooks/useDebounce';

const PREFIX = 'MythicTextField';

const classes = {
    root: `${PREFIX}Div-root`,
    textFieldRoot: `${PREFIX}-root`,
};

const Root = styled('div')(() => ({
    [`&.${classes.root}`]: {},
}));

const ValidationTextField = styled(TextField)(() => ({
    [`&.${classes.textFieldRoot}`]: {
        '& fieldset': { borderColor: 'grey', borderWidth: 1 },
        '& input:invalid + fieldset': { borderColor: 'red', borderWidth: 2 },
        '& input:valid:focus + fieldset': { borderLeftWidth: 6, padding: '4px !important' },
        '& textarea:focus + textarea + fieldset': { borderLeftWidth: 6 },
    },
}));

interface MythicTextFieldProps {
    placeholder?: string;
    name: string;
    validate?: (value: string) => boolean;
    width?: number;
    onChange: (name: string, value: string, error: boolean, event?: any) => void;
    requiredValue?: boolean;
    type?: string;
    onEnter?: (event: React.KeyboardEvent) => void;
    autoFocus?: boolean;
    autoComplete?: boolean;
    showLabel?: boolean;
    variant?: 'outlined' | 'filled' | 'standard';
    inline?: boolean;
    marginBottom?: string;
    value: string;
    disabled?: boolean;
    marginTop?: string;
    InputProps?: any;
    inputLabelProps?: any;
    multiline?: boolean;
    maxRows?: number;
    errorText?: string;
    helperText?: string;
    debounceDelay?: number;
}

const MythicTextField: React.FC<MythicTextFieldProps> = ({
    placeholder,
    name,
    validate,
    width,
    onChange,
    requiredValue = false,
    type = 'text',
    onEnter,
    autoFocus,
    autoComplete = false,
    showLabel = true,
    variant = 'outlined',
    inline,
    marginBottom = '5px',
    value,
    disabled = false,
    marginTop = '5px',
    InputProps = {},
    inputLabelProps = {},
    multiline = false,
    maxRows = 10,
    errorText = '',
    helperText = '',
    debounceDelay = 100,
}) => {
    const [localValue, setLocalValue] = React.useState<{ value: string; event: any }>({ value, event: null });
    const [localError, setLocalError] = React.useState(false);
    const debouncedLocalInput = useDebounce(localValue, debounceDelay);

    React.useEffect(() => {
        const error = validate ? validate(debouncedLocalInput.value) : false;
        onChange(name, debouncedLocalInput.value, error, debouncedLocalInput.event);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only fire on debounced input change, not on callback identity
    }, [debouncedLocalInput]);

    React.useEffect(() => {
        setLocalValue({ value, event: null });
    }, [value]);

    const handleChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = evt.target.value;
        setLocalValue({ value: newValue, event: evt });
        setLocalError(validate ? validate(newValue) : false);
    };

    const onKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            if (event.shiftKey) {
                return;
            }
            if (onEnter !== undefined) {
                event.stopPropagation();
                event.preventDefault();
                onEnter(event);
            }
        }
    };

    return (
        <Root style={{ width: width ? width + 'rem' : '100%', display: inline ? 'inline-block' : '' }}>
            <ValidationTextField
                fullWidth
                placeholder={placeholder}
                value={localValue.value}
                onChange={handleChange}
                color="secondary"
                onKeyDown={onKeyPress}
                label={showLabel ? name : undefined}
                autoFocus={autoFocus}
                variant={variant}
                data-lpignore
                autoComplete={autoComplete === undefined ? 'new-password' : autoComplete ? 'on' : 'off'}
                disabled={disabled}
                required={requiredValue}
                InputLabelProps={inputLabelProps}
                multiline={multiline}
                maxRows={maxRows}
                error={localError}
                type={type}
                onWheel={(event) => (event.target as HTMLElement).blur()}
                InputProps={{ ...InputProps, spellCheck: false }}
                helperText={localError ? errorText : helperText}
                style={{
                    padding: 0,
                    marginBottom: marginBottom || '5px',
                    marginTop: marginTop || '5px',
                    display: inline ? 'inline-block' : '',
                }}
                classes={{ root: classes.textFieldRoot }}
            />
        </Root>
    );
};

export default MythicTextField;
