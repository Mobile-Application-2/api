import Letter from "./Letter.js";

export default class LetterFactory {
    static alphabets = 'abcdefghijklmnopqrstuvwxyz'.toUpperCase().split('');
    static letterBG = "./assets/letterBG.jpg";

    static genLetters() {
        const letters = [new Letter()];
        letters.splice(0, 1);

        this.alphabets.forEach(alphabet => {
            let score = this.getScoreForLetter(alphabet);

            const letter = new Letter(alphabet, score, this.letterBG);

            letters.push(letter);
        })

        return letters;
    }

    static genLettersWithAlphabet(arrayOfAlphabets = [""]) {
        const letters = [new Letter()];
        letters.splice(0, 1);

        arrayOfAlphabets.forEach(alphabet => {
            let score = this.getScoreForLetter(alphabet);

            const letter = new Letter(alphabet, score, this.letterBG);

            letters.push(letter);
        })

        return letters;
    }

    static getScoreForLetter(alphabet) {
        let score = 0;

        const set = {
            "1": ["A", "E", "I", "O", "U", "L", "N", "S", "T", "R"],
            "2": ["D", "G"],
            "3": ["B", "C", "M", "P"],
            "4": ["F", "H", "V", "W", "Y"],
            "5": ["K"],
            "8": ["J", "X"],
            "10": ["Z"],
        }

        for(const keys in set) {
            const value = Number(keys);
            const letters = set[keys]

            if(letters.includes(alphabet)) {
                score = value;

                break
            }
        }

        return score;
    }

}