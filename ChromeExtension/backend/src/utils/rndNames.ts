import { uniqueNamesGenerator, adjectives, animals, colors } from 'unique-names-generator';

export const generateName = () => {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: '-',
    }) + '-' + Math.floor(Math.random() * 1000);
};

export default generateName;