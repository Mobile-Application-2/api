export default class Letter {
    alphabet = '';
    score = 0;
    bg = '';
    indexPlaced = 0;

    constructor(alphabet = '', score = 0, bgURL) {
        this.alphabet = alphabet;
        this.score = score;
        this.bg = bgURL;
    }

    setIndexPlaced(index) {
        this.indexPlaced = index;
    }

    getIndexPlaced() {
        return this.indexPlaced;
    }
}