"""
Given a m x n grid filled with non-negative numbers, find a path from top left to bottom right, 
which minimizes the sum of all numbers along its path.

Note: You can only move either down or right at any point in time.

Input: grid = [[1,3,1],[1,5,1],[4,2,1]]
Output: 7
Explanation: Because the path 1 → 3 → 1 → 1 → 1 minimizes the sum.
Example 2:

Input: grid = [[1,2,3],[4,5,6]]
Output: 12

Constraints:

m == grid.length
n == grid[i].length
1 <= m, n <= 200
0 <= grid[i][j] <= 200
"""

grid = [[1,3,1],[1,5,1],[4,2,1]]
def func(grid):
    m = len(grid) 
    n = len(grid[0]) 
    dp = [[0]*(n) for _ in range(m)]
    dp[0][0] = grid[0][0]

    # entire first column
    for i in range(1, m):
        dp[i][0] = dp[i-1][0] + grid[i][0]

    # entire first row
    for j in range(1, n):
        dp[0][j] = dp[0][j-1] + grid[0][j]

    if m>=2 and n>=2:
        dp[1][0] = grid[0][0]+grid[1][0]
        dp[0][1] = grid[0][0]+grid[0][1]

        for i in range(1,m): # number of rows
            for j in range(1,n): # number of columns
                dp[i][j] = grid[i][j]+min(dp[i-1][j], dp[i][j-1])
        
    return dp[m-1][n-1]
    

print(func(grid))