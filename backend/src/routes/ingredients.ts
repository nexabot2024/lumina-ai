import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createIngredient, getIngredients, deleteIngredient } from '../services/databaseService.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const ingredients = getIngredients().map(i => ({
      id: i.id,
      name: i.name,
      imagePaths: JSON.parse(i.imagePaths) as string[],
      createdAt: i.createdAt,
    }));
    res.json({ ingredients });
  } catch (error) {
    console.error('Error fetching ingredients:', error);
    res.status(500).json({ error: 'Failed to fetch ingredients' });
  }
});

interface CreateIngredientBody {
  name: string;
  imagePaths: string[];
}

router.post('/', (req: Request<{}, {}, CreateIngredientBody>, res: Response) => {
  try {
    const { name, imagePaths } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El ingrediente necesita un nombre' });
    }
    if (!imagePaths || imagePaths.length === 0) {
      return res.status(400).json({ error: 'El ingrediente necesita al menos una imagen' });
    }
    const id = uuidv4();
    createIngredient(id, name.trim(), imagePaths);
    res.json({ ingredient: { id, name: name.trim(), imagePaths, createdAt: Date.now() } });
  } catch (error) {
    console.error('Error creating ingredient:', error);
    res.status(500).json({ error: 'Failed to create ingredient' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    deleteIngredient(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting ingredient:', error);
    res.status(500).json({ error: 'Failed to delete ingredient' });
  }
});

export default router;
