import { uniqueNamesGenerator, adjectives, animals, colors } from 'unique-names-generator';

export const generateName = () => {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, colors, animals],
        separator: '-',
    }) + '-' + Math.floor(Math.random() * 10000);
};

export default generateName;