import { validate as uuidValidate } from 'uuid';
import type { CommandDefinition, CommandParameter } from '../../types/commands';
import { snackActions } from '../../lib/snackbar';

/** A loaded command with its parameters */
export type LoadedCmd = CommandDefinition & { commandparameters: CommandParameter[] };

export const GetDefaultValueForType = (parameter_type: string): string | number | boolean | string[] | undefined => {
    switch (parameter_type) {
        case "string": return "";
        case "typedArray": case "array": return [];
        case "number": return 0;
        case "boolean": return true;
        default: return undefined;
    }
};

export const parseToArgv = (str: string): string[] => {
    const res: string[] = [];
    if (!str || typeof str !== 'string') return res;
    let sQuoted = false, dQuoted = false, backslash = false;
    let buffer = '';
    str.split('').forEach((value) => {
        if ((sQuoted || dQuoted) && value === "\\") {
            if (!backslash) { backslash = true; return; }
            else { backslash = false; buffer += "\\"; return; }
        }
        if (!sQuoted && !dQuoted) {
            if (value === `'`) {
                if (backslash) { backslash = false; buffer += "'"; return; }
                sQuoted = true; buffer += value; return;
            } else if (value === '"') {
                if (backslash) { backslash = false; buffer += '"'; return; }
                dQuoted = true; buffer += value; return;
            } else if (value === " ") {
                if (backslash) { backslash = false; buffer += "\\"; }
                if (buffer.length > 0) {
                    if (buffer[buffer.length - 1] === buffer[0] && [`'`, `"`].includes(buffer[0])) {
                        res.push(buffer.slice(1, -1));
                    } else { res.push(buffer); }
                }
                buffer = ''; return;
            }
        }
        if (sQuoted && value === `'`) {
            if (backslash) { buffer += "'"; backslash = false; return; }
            sQuoted = false;
            buffer += (buffer.length > 0) ? value : value + value;
            return;
        }
        if (dQuoted && value === `"`) {
            if (backslash) { buffer += '"'; backslash = false; return; }
            dQuoted = false;
            buffer += (buffer.length > 0) ? value : value + value;
            return;
        }
        if (backslash) { buffer += `\\${value}`; backslash = false; }
        else { buffer += value; }
    });
    if (backslash) buffer += "\\";
    if (buffer.length > 0) {
        if (buffer[buffer.length - 1] === buffer[0] && [`'`, `"`].includes(buffer[0])) {
            res.push(buffer.slice(1, -1));
        } else { res.push(buffer); }
    }
    if (dQuoted) throw new SyntaxError('unexpected end of string while looking for matching double quote');
    if (sQuoted) throw new SyntaxError('unexpected end of string while looking for matching single quote');
    return res;
};

export const parseArgvToDict = (argv: string[], cmd: LoadedCmd): Record<string, unknown> | undefined => {
    const stringArgs: string[] = [], booleanArgs: string[] = [], arrayArgs: string[] = [];
    const typedArrayArgs: string[] = [], numberArgs: string[] = [], fileArgs: string[] = [], complexArgs: string[] = [];
    const allCLINames: string[] = [];
    for (let i = 0; i < cmd.commandparameters.length; i++) {
        allCLINames.push("-" + cmd.commandparameters[i].cli_name);
        switch (cmd.commandparameters[i].parameter_type) {
            case "ChooseOne": case "ChooseOneCustom": case "String": stringArgs.push("-" + cmd.commandparameters[i].cli_name); break;
            case "Number": numberArgs.push("-" + cmd.commandparameters[i].cli_name); break;
            case "Boolean": booleanArgs.push("-" + cmd.commandparameters[i].cli_name); break;
            case "Array": case "ChooseMultiple": arrayArgs.push("-" + cmd.commandparameters[i].cli_name); break;
            case "TypedArray": typedArrayArgs.push("-" + cmd.commandparameters[i].cli_name); break;
            case "File": fileArgs.push("-" + cmd.commandparameters[i].cli_name); break;
            default: complexArgs.push("-" + cmd.commandparameters[i].cli_name);
        }
    }
    const result: Record<string, unknown> = { "_": [] };
    let current_argument = "", current_argument_type = "";
    for (let i = 0; i < argv.length; i++) {
        const value = argv[i];
        if (current_argument === "") {
            if (stringArgs.includes(value)) { current_argument_type = "string"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("string"); }
            else if (booleanArgs.includes(value)) { current_argument_type = "boolean"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("boolean"); }
            else if (arrayArgs.includes(value)) { current_argument_type = "array"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("array"); }
            else if (typedArrayArgs.includes(value)) { current_argument_type = "typedArray"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("typedArray"); }
            else if (numberArgs.includes(value)) { current_argument_type = "number"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("number"); }
            else if (fileArgs.includes(value)) { current_argument_type = "file"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("string"); }
            else if (complexArgs.includes(value)) { current_argument_type = "complex"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("string"); }
            else { (result["_"] as string[]).push(value); current_argument = ""; current_argument_type = ""; }
        } else {
            if (allCLINames.includes(value)) {
                if (result[current_argument.slice(1)] === undefined) result[current_argument.slice(1)] = GetDefaultValueForType(current_argument_type);
                current_argument = ""; current_argument_type = ""; i -= 1; continue;
            }
            switch (current_argument_type) {
                case "string":
                    result[current_argument.slice(1)] = value; current_argument = ""; current_argument_type = ""; break;
                case "file":
                    if (uuidValidate(value)) { result[current_argument.slice(1)] = value; current_argument = ""; current_argument_type = ""; break; }
                    snackActions.warning("File type value must be UUID of uploaded file: " + value); return undefined;
                case "boolean":
                    if (["false", "true"].includes(value.toLowerCase())) {
                        result[current_argument.slice(1)] = value.toLowerCase() !== "false";
                    } else { result[current_argument.slice(1)] = true; }
                    current_argument = ""; current_argument_type = ""; break;
                case "number":
                    try {
                        const num = Number(value);
                        if (isNaN(num)) { snackActions.warning("Failed to parse number: " + value); return undefined; }
                        result[current_argument.slice(1)] = num;
                    } catch (error) { snackActions.warning("Failed to parse number: " + error); return undefined; }
                    current_argument = ""; current_argument_type = ""; break;
                case "typedArray":
                    if (stringArgs.includes(value)) { current_argument_type = "string"; current_argument = value; }
                    else if (booleanArgs.includes(value)) { current_argument_type = "boolean"; current_argument = value; }
                    else if (arrayArgs.includes(value)) { current_argument_type = "typedArray"; current_argument = value; }
                    else if (numberArgs.includes(value)) { current_argument_type = "number"; current_argument = value; }
                    else {
                        if (result[current_argument.slice(1)] === undefined) result[current_argument.slice(1)] = [["", value]];
                        else (result[current_argument.slice(1)] as unknown[]).push(["", value]);
                    }
                    break;
                case "array":
                    if (stringArgs.includes(value)) { current_argument_type = "string"; current_argument = value; }
                    else if (booleanArgs.includes(value)) { current_argument_type = "boolean"; current_argument = value; }
                    else if (arrayArgs.includes(value)) { current_argument_type = "array"; current_argument = value; }
                    else if (numberArgs.includes(value)) { current_argument_type = "number"; current_argument = value; }
                    else {
                        if (result[current_argument.slice(1)] === undefined) result[current_argument.slice(1)] = [value];
                        else (result[current_argument.slice(1)] as unknown[]).push(value);
                    }
                    break;
                case "complex":
                    try { result[current_argument.slice(1)] = JSON.parse(value); } catch { result[current_argument.slice(1)] = value; }
                    current_argument = ""; current_argument_type = ""; break;
                default: break;
            }
        }
    }
    return result;
};

export const parseCommandLine = (command_line: string, cmd: LoadedCmd): Record<string, unknown> | undefined => {
    if (command_line.length > 0 && command_line[0] === "{") {
        try {
            const json_arguments = JSON.parse(command_line);
            json_arguments["_"] = [];
            return json_arguments;
        } catch (error) {
            snackActions.warning("Failed to parse custom JSON command line: " + error);
            return undefined;
        }
    }
    try {
        const argv = parseToArgv(command_line);
        return parseArgvToDict(argv, cmd);
    } catch (error) {
        snackActions.warning("Failed to parse command line: " + error);
        return undefined;
    }
};

export const determineCommandGroupName = (cmd: LoadedCmd, parsed: Record<string, unknown>): string[] | undefined => {
    if (cmd.commandparameters.length === 0) return [];
    if (!parsed) return [];
    let cmdGroupOptions: string[] = cmd.commandparameters.reduce((prev: string[], cur: CommandParameter) => {
        if (prev.includes(cur.parameter_group_name)) return prev;
        return [...prev, cur.parameter_group_name];
    }, []);
    for (const key of Object.keys(parsed)) {
        if (key !== "_") {
            const paramGroups: string[] = [];
            let foundParamGroup = false;
            for (let i = 0; i < cmd.commandparameters.length; i++) {
                if (cmd.commandparameters[i]["cli_name"] === key || cmd.commandparameters[i]["display_name"] === key || cmd.commandparameters[i]["name"] === key) {
                    foundParamGroup = true;
                    paramGroups.push(cmd.commandparameters[i]["parameter_group_name"]);
                }
            }
            const intersection = cmdGroupOptions.reduce((prev: string[], cur: string) => {
                if (paramGroups.includes(cur)) return [...prev, cur];
                return prev;
            }, []);
            if (intersection.length === 0) {
                if (foundParamGroup) return undefined;
            } else { cmdGroupOptions = [...intersection]; }
        }
    }
    return cmdGroupOptions;
};

export const simplifyGroupNameChoices = (groupNames: string[], cmd: LoadedCmd, parsed: Record<string, unknown>): string => {
    const finalGroupNames: string[] = [];
    for (let i = 0; i < groupNames.length; i++) {
        let foundAllRequired = true;
        for (let j = 0; j < cmd.commandparameters.length; j++) {
            if (cmd.commandparameters[j]["parameter_group_name"] === groupNames[i]) {
                if (cmd.commandparameters[j].required &&
                    parsed[cmd.commandparameters[j].cli_name] === undefined &&
                    parsed[cmd.commandparameters[j].name] === undefined) {
                    foundAllRequired = false;
                }
            }
        }
        if (foundAllRequired) finalGroupNames.push(groupNames[i]);
    }
    if (finalGroupNames.length === 0) return "";
    if (finalGroupNames.length === 1) return finalGroupNames[0];
    return "";
};

export const fillOutPositionalArguments = (cmd: LoadedCmd, parsed: Record<string, unknown>, groupNames: string[], inputMessage: string): Record<string, unknown> | undefined => {
    const parsedCopy = { ...parsed, "_": [...(parsed["_"] as string[])] };
    parsedCopy["_"].shift(); // remove command name
    if (cmd.commandparameters.length === 0 || groupNames.length === 0) return parsedCopy;
    const usedGroupName = groupNames.includes("Default") ? "Default" : groupNames[0];
    const groupParameters = cmd.commandparameters
        .filter((c: CommandParameter) => c.parameter_group_name === usedGroupName)
        .sort((a: CommandParameter, b: CommandParameter) => a.ui_position < b.ui_position ? -1 : 1);
    const unSatisfied: CommandParameter[] = groupParameters.filter((p: CommandParameter) => !(p["cli_name"] in parsedCopy));
    for (let i = 0; i < unSatisfied.length; i++) {
        if (parsedCopy["_"].length === 0) break;
        const temp = parsedCopy["_"].shift()!;
        switch (unSatisfied[i]["parameter_type"]) {
            case "ChooseOne": case "ChooseOneCustom": case "String": parsedCopy[unSatisfied[i]["cli_name"]] = temp; break;
            case "Number":
                try {
                    const n = Number(temp);
                    if (isNaN(n)) { snackActions.warning("Failed to parse number: " + temp); return undefined; }
                    parsedCopy[unSatisfied[i]["cli_name"]] = n;
                } catch (err) { snackActions.warning("Failed to parse number: " + err); return undefined; }
                break;
            case "Boolean":
                if (temp.toLowerCase() === "false") parsedCopy[unSatisfied[i]["cli_name"]] = false;
                else if (temp.toLowerCase() === "true") parsedCopy[unSatisfied[i]["cli_name"]] = true;
                else { snackActions.warning("Failed to parse boolean: " + temp); return undefined; }
                break;
            case "Array": case "TypedArray": case "FileMultiple": case "ChooseMultiple":
                if (parsedCopy[unSatisfied[i]["cli_name"]]) (parsedCopy[unSatisfied[i]["cli_name"]] as unknown[]).push(temp);
                else parsedCopy[unSatisfied[i]["cli_name"]] = [temp];
                i -= 1; break;
            default: parsedCopy[unSatisfied[i]["cli_name"]] = temp; break;
        }
    }
    // If there are still leftover positional args and unsatisfied params, greedily assign to last param
    if (unSatisfied.length > 0 && parsedCopy["_"].length > 0) {
        let temp = "";
        let negativeIndex = inputMessage.length;
        for (let pci = parsedCopy["_"].length - 1; pci >= 0; pci--) {
            const startIndex = inputMessage.lastIndexOf(parsedCopy["_"][pci], negativeIndex);
            negativeIndex = startIndex - 1;
            if (inputMessage[startIndex - 1] === "'") {
                if (startIndex + parsedCopy["_"][pci].length + 1 < inputMessage.length && inputMessage[startIndex + parsedCopy["_"][pci].length + 1] === "'")
                    temp = "'" + parsedCopy["_"][pci] + "' " + temp;
                else temp = parsedCopy["_"][pci] + " " + temp;
            } else if (inputMessage[startIndex - 1] === '"') {
                if (startIndex + parsedCopy["_"][pci].length < inputMessage.length && inputMessage[startIndex + parsedCopy["_"][pci].length] === '"')
                    temp = '"' + parsedCopy["_"][pci] + '" ' + temp;
                else temp = parsedCopy["_"][pci] + " " + temp;
            } else { temp = parsedCopy["_"][pci] + " " + temp; }
            temp = temp.trim();
        }
        const lastParam = unSatisfied[unSatisfied.length - 1];
        switch (lastParam["parameter_type"]) {
            case "ChooseOne": case "ChooseOneCustom": case "String":
                parsedCopy[lastParam["cli_name"]] = (parsedCopy[lastParam["cli_name"]] ? parsedCopy[lastParam["cli_name"]] + " " : "") + temp; break;
            case "Number":
                try { const n = Number(temp); if (isNaN(n)) { snackActions.warning("Failed to parse number: " + temp); return undefined; } parsedCopy[lastParam["cli_name"]] = n; }
                catch (err) { snackActions.warning("Failed to parse number: " + err); return undefined; }
                break;
            case "Boolean":
                if (temp.toLowerCase() === "false") parsedCopy[lastParam["cli_name"]] = false;
                else if (temp.toLowerCase() === "true") parsedCopy[lastParam["cli_name"]] = true;
                else { snackActions.warning("Failed to parse boolean: " + temp); return undefined; }
                break;
            case "Array": case "TypedArray": case "FileMultiple": case "ChooseMultiple":
                parsedCopy[lastParam["cli_name"]] = [parsedCopy[lastParam["cli_name"]], ...parsedCopy["_"]]; break;
            default: parsedCopy[lastParam["cli_name"]] = temp; break;
        }
        parsedCopy["_"] = [];
    }
    return parsedCopy;
};
