/**
 * Randomly shuffles a given array
 * 
 * Credit to: https://javascript.info/task/shuffle
 * @param array array to shuffle
 */
export function shuffle(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i

    // swap elements array[i] and array[j]
    // we use "destructuring assignment" syntax to achieve that
    [array[i], array[j]] = [array[j], array[i]];
  }
}


export function getRandomInt(max: number) : number {
  return Math.floor(Math.random() * Math.floor(max));
}

export function getRandomItem(a: any[]) : any {
  return a[getRandomInt(a.length)];
}
export function getHalf(number: number) : number {
  return Math.floor((number) / 2) + 1;
}