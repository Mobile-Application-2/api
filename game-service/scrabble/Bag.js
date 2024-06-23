import Letter from "./Letter.js";

export default class Bag {
    letterFrequencyMap = {
        'A': 9,
        'B': 2,
        'C': 2,
        'D': 4,
        'E': 12,
        'F': 2,
        'G': 3,
        'H': 2,
        'I': 9,
        'J': 1,
        'K': 1,
        'L': 4,
        'M': 2,
        'N': 6,
        'O': 8,
        'P': 2,
        'Q': 1,
        'R': 6,
        'S': 4,
        'T': 6,
        'U': 4,
        'V': 2,
        'W': 2,
        'X': 1,
        'Y': 2,
        'Z': 1,
    }

    finalLetters = [new Letter()];

    constructor(letters = [new Letter()]) {
        this.finalLetters.splice(0, 1);

        letters.map(letter => {
            const letterFrequency = this.letterFrequencyMap[letter.alphabet];

            for(let i = 0; i < letterFrequency; ++i) {
                this.finalLetters.push(letter);
            }
        })
    }
}