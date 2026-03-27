import pygame
import random
import sys

# --- Constants ---
TILE = 20
COLS = 30
ROWS = 24
WIDTH = COLS * TILE
HEIGHT = ROWS * TILE
FPS = 10

BLACK  = (0,   0,   0)
GREEN  = (50,  200, 50)
DGREEN = (30,  140, 30)
RED    = (220, 50,  50)
WHITE  = (255, 255, 255)
GRAY   = (40,  40,  40)
YELLOW = (255, 220, 0)

UP    = (0, -1)
DOWN  = (0,  1)
LEFT  = (-1, 0)
RIGHT = (1,  0)

def random_food(snake):
    while True:
        pos = (random.randint(0, COLS - 1), random.randint(0, ROWS - 1))
        if pos not in snake:
            return pos

def draw_tile(surf, x, y, color, inner_color=None):
    rect = pygame.Rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2)
    pygame.draw.rect(surf, color, rect, border_radius=4)
    if inner_color:
        inner = rect.inflate(-6, -6)
        pygame.draw.rect(surf, inner_color, inner, border_radius=2)

def draw_grid(surf):
    for x in range(COLS):
        for y in range(ROWS):
            pygame.draw.rect(surf, GRAY, (x * TILE, y * TILE, TILE, TILE), 1)

def show_centered(surf, font, text, y, color=WHITE):
    img = font.render(text, True, color)
    surf.blit(img, (WIDTH // 2 - img.get_width() // 2, y))

def game_loop(screen, clock, font, big_font):
    snake = [(COLS // 2, ROWS // 2)]
    direction = RIGHT
    next_dir = RIGHT
    food = random_food(snake)
    score = 0
    running = True

    while running:
        clock.tick(FPS)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_UP, pygame.K_w) and direction != DOWN:
                    next_dir = UP
                elif event.key in (pygame.K_DOWN, pygame.K_s) and direction != UP:
                    next_dir = DOWN
                elif event.key in (pygame.K_LEFT, pygame.K_a) and direction != RIGHT:
                    next_dir = LEFT
                elif event.key in (pygame.K_RIGHT, pygame.K_d) and direction != LEFT:
                    next_dir = RIGHT
                elif event.key == pygame.K_ESCAPE:
                    return score, False  # quit to menu

        direction = next_dir
        head = (snake[0][0] + direction[0], snake[0][1] + direction[1])

        # Wall collision
        if not (0 <= head[0] < COLS and 0 <= head[1] < ROWS):
            return score, True

        # Self collision
        if head in snake:
            return score, True

        snake.insert(0, head)

        if head == food:
            score += 10
            food = random_food(snake)
        else:
            snake.pop()

        # Draw
        screen.fill(BLACK)
        draw_grid(screen)

        for i, (x, y) in enumerate(snake):
            color = GREEN if i > 0 else DGREEN
            inner = DGREEN if i > 0 else GREEN
            draw_tile(screen, x, y, color, inner)

        # Food (pulsing dot)
        fx, fy = food
        pygame.draw.circle(screen, RED,
                           (fx * TILE + TILE // 2, fy * TILE + TILE // 2),
                           TILE // 2 - 2)
        pygame.draw.circle(screen, YELLOW,
                           (fx * TILE + TILE // 2, fy * TILE + TILE // 2),
                           TILE // 4)

        score_img = font.render(f"Score: {score}", True, WHITE)
        screen.blit(score_img, (8, 4))

        pygame.display.flip()

    return score, False

def menu(screen, clock, font, big_font, last_score=None, game_over=False):
    while True:
        clock.tick(30)
        screen.fill(BLACK)

        show_centered(screen, big_font, "SNAKE", HEIGHT // 4, GREEN)

        if game_over and last_score is not None:
            show_centered(screen, font, f"Game Over!  Score: {last_score}", HEIGHT // 2 - 30, RED)

        show_centered(screen, font, "Press SPACE to play", HEIGHT // 2 + 10, WHITE)
        show_centered(screen, font, "Arrow keys / WASD to move   ESC to quit", HEIGHT // 2 + 45, GRAY)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    return
                if event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()

        pygame.display.flip()

def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Snake")
    clock = pygame.time.Clock()
    font = pygame.font.SysFont("consolas", 20)
    big_font = pygame.font.SysFont("consolas", 64, bold=True)

    last_score = None
    game_over = False

    while True:
        menu(screen, clock, font, big_font, last_score, game_over)
        last_score, game_over = game_loop(screen, clock, font, big_font)

if __name__ == "__main__":
    main()
