/**
 * User-facing pit number. Bottom row (indices 0-5) is labeled 1-6,
 * top row (indices 7-12) is labeled 7-12. Stores have no label.
 */
export const pitLabel = (pit: number): number => (pit <= 5 ? pit + 1 : pit)
